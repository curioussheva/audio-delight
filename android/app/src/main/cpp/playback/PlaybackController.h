#pragma once

#include <memory>
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <functional>
#include <mutex>
#include <string>
#include <vector>
#include "PlaybackState.h"
#include "PlaybackClock.h"
#include "PCMQueue.h"
#include "PlaybackTypes.h"
#include "TrackQueue.h"
#include "FadeEngine.h"
#include "PlaybackRateProcessor.h"
#include "PitchShifter.h"
#include "../decoder/DecoderWorker.h"
#include "../core/AudioMetrics.h"

namespace pristine::playback {

class PlaybackController {
public:
    PlaybackController();
    ~PlaybackController();

    PlaybackController(const PlaybackController&) = delete;
    PlaybackController& operator=(const PlaybackController&) = delete;

    // Lifecycle
    bool initialize();
    void shutdown();
    bool isInitialized() const noexcept;

    // Transport
    bool loadTrack(const TrackInfo& track);
    bool play();
    bool pause();
    bool stop();
    bool seek(double seconds);

    // Queue & Navigation
    bool next();
    bool previous();
    void setShuffle(bool enabled);
    void setRepeatMode(RepeatMode mode);
    std::shared_ptr<TrackQueue> queue() const noexcept;

    // 🔥 FIX (2026-11-10, P-M9): laju playback 0.5x–2.0x (WSOLA time-stretch,
    // tanpa perubahan pitch). Sebelumnya placebo: UI hanya menulis Zustand +
    // AsyncStorage, tidak ada jalur ke native. Laju disimpan atomic dan
    // DITERAPKAN render() di audio thread (reset buffer WSOLA di sana) —
    // setPlaybackRate sendiri tidak menyentuh vector prosesor supaya tidak
    // ada race dengan audio thread. Rate 1.0 = bypass (nol overhead).
    void setPlaybackRate(float rate) noexcept;
    [[nodiscard]] float playbackRate() const noexcept;

    // 🔥 FASE R (2026-11-11): retune — phase vocoder pitch shift (PitchShifter).
    // Pola yang SAMA dengan setPlaybackRate (P-M9): rasio disimpan atomic dan
    // DITERAPKAN render() di audio thread (reset buffer di sana supaya tidak
    // race dengan push/pull). Rasio 1.0 = bypass (nol overhead, jalur
    // bit-perfect tidak tersentuh). Rentang 0.5–2.0 (±1 oktaf); A=432 =
    // 432/440 = 0.98182.
    //
    // Gate bit-perfect (PB6-W1, 2026-11-12): retune, laju playback, dan
    // fade track adalah processing, jadi FORCED OFF / dipersingkat di mode
    // bit-perfect. EngineManager::setProcessingMode() memanggil
    // setProcessingAllowed(mode != BitPerfect); render() memakai rasio
    // efektif 1.0 saat tidak diizinkan (buffer prosesor di-reset di sana),
    // dan loadTrack() memakai fade anti-klik 10 ms, bukan 300/500 ms.
    void setPitchRatio(float ratio) noexcept;
    [[nodiscard]] float pitchRatio() const noexcept;
    void setProcessingAllowed(bool allowed) noexcept;

    // Audio thread. Mengembalikan jumlah SAMPLE OUTPUT yang benar-benar
    // dihasilkan (bisa kurang dari frames*channels kalau queue lapar =
    // underrun). AudioCallback memakainya untuk metrik + mengisi sisa dengan
    // senyap. Pengecualian (P-M2/p-m14, 2026-11-10): saat paused/clearing,
    // buffer diisi senyap dan return = requestedSamples — buffer MEMANG
    // terisi, jadi bukan underrun.
    size_t render(float* output, uint32_t frames, uint32_t channels, uint32_t sampleRate) noexcept;

    // Jumlah SAMPLE yang menunggu di queue (untuk metrik bufferedSamples).
    // Dipanggil dari audio thread — hanya atomic load, tanpa lock.
    size_t bufferedSamples() const noexcept;

    // PB6-W2C (2026-11-12): total sampel NaN/Inf/|x|>2 yang dibersihkan
    // safety net render(). Dihitung di audio thread (atomic, tanpa log)
    // — DILOG dari thread polling JNI (nativeGetPosition, tiap 500 ms,
    // lihat NativePlaybackModule.cpp), bukan dari render(): log per
    // callback yang mengandung NaN = sampai 100/dtk @480 frame.
    // Kumulatif sejak initialize(), tidak di-reset per track (sama
    // seperti static totalNan lama yang digantikannya).
    [[nodiscard]] uint32_t nanCleanedTotal() const noexcept;

    // Metrik engine (diset EngineManager dari AudioEngine::metrics()).
    // Dipakai untuk mencatat overrun saat decoder membuang data karena queue
    // penuh. Boleh null — PlaybackController tetap jalan tanpa metrik.
    void setMetrics(pristine::AudioMetrics* metrics) noexcept;

    // Dipanggil setiap loadTrack() berhasil (M1, 2026-11-10): EngineManager
    // memakai ini untuk membuka ulang stream kalau laju file berubah.
    // Boleh null. Dipanggil di AKHIR loadTrack, di luar lock apa pun.
    void setTrackLoadedListener(std::function<void()> listener);

    // Laju stream yang SEDANG dipakai. Diisi oleh pemilik stream (AudioEngine
    // lewat AudioCallback) supaya decoder tahu target laju yang benar.
    //
    // Tanpa ini decoder memakai default 48000, sehingga file 96/192 kHz
    // diturunkan ke 48 kHz - kebalikan dari bit-perfect.
    void setStreamSampleRate(uint32_t rate) noexcept;
    uint32_t streamSampleRate() const noexcept;

    // 🔥 FIX (2026-10-07): laju FILE yang diminta, berbeda dari laju stream.
    //
    // Diisi otomatis oleh loadTrack(track.sampleRate), lalu dibaca
    // EngineManager untuk memilih laju stream lewat
    // audio::pickBestRate() (core/RateSelection.h). Tanpa ini tidak ada jalur yang
    // membawa laju file ke pembukaan stream: stream selalu dibuka di laju
    // tertinggi perangkat, bukan laju file.
    //
    // 0 = laju file tidak diketahui (metadata tidak terbaca) -> engine
    // mendeteksi sendiri.
    //
    // ⚠️ Memilih laju stream yang BENAR saat start() belum menghasilkan
    // bit-perfect kalau stream dibuka sebelum track dimuat. Bit-perfect butuh
    // stream dibuka di laju track, jadi urutan panggilannya: loadTrack dulu,
    // baru start().
    void setFileSampleRate(uint32_t rate) noexcept;
    uint32_t currentFileSampleRate() const noexcept;

    // 🔥 FIX (2026-11-11, D-M2): muat ulang track saat ini kalau decoder
    // dibuat dengan target laju yang berbeda dari laju stream aktual.
    // Dipanggil EngineManager::start() setelah stream terbuka — hanya
    // relevan untuk track pertama (stream masih 0 saat startDecoder).
    // Berjalan di thread JS (bukan audio thread): loadTrack aman di sini.
    // Return true kalau reload dilakukan.
    bool reloadIfDecoderRateMismatch(uint32_t actualStreamRate);

    // State accessors
    // 🔥 DIPANGKAS (2026-11-10, dead-code playback): clock()/pcmQueue()
    // dihapus — 0 pemakai (yang hidup: state() dipakai JNI, queue()
    // dipakai JNI + EngineManager).
    std::shared_ptr<PlaybackState> state() const noexcept;

    // true kalau decoder untuk sebuah track sudah terbuka.
    //
    // Dipakai getController() JNI untuk memuat track tepat SATU kali sebelum
    // engine start - memuat track itu me-reset posisi dan clock, jadi tidak
    // boleh dipanggil berulang tiap JNI call.
    bool hasDecoder() const noexcept;

private:
    bool startDecoder(const TrackInfo& track);
    void stopDecoder();

    // 🔥 Advance queue + loadTrack setelah EOF (dipanggil dari thread decoder).
    // PB6-W3: HANYA mem-post permintaan ke advance worker permanen (lihat
    // advanceWorkerLoop) — tanpa join, tanpa lock selain advanceMutex_.
    // finishedUri = URI trek yang baru berakhir (untuk event ke JS — di-emit
    // SETELAH ekor habis dimainkan, bukan saat EOF, P-M1).
    void scheduleAdvance(const std::string& finishedUri);
    // 🔥 FIX (2026-11-10, P-M1): batalkan advance yang sedang menunggu drain.
    // Dipanggil stop()/loadTrack()/shutdown() sebelum pekerjaan mereka.
    // PB6-W3: mengambil loadTrackMutex_ sebentar saat menaikkan flag —
    // lihat (b) pada komentar advanceWorker_ di bawah.
    void cancelPendingAdvance() noexcept;
    // PB6-W3: loop worker advance permanen + satu permintaan advance.
    void advanceWorkerLoop();
    void processAdvance(const std::string& finishedUri);
    // PB6-W3: tunggu worker advance selesai memproses permintaan yang
    // sedang berjalan (dipakai stop() sebelum mengambil loadTrackMutex_).
    void waitForAdvanceIdle();
    // 🔥 FIX (2026-11-10, p-m12): tunggu in-flight render() selesai (maks
    // 100 ms) setelah clearing_ dikibarkan, sebelum pcmQueue_->clear().
    void waitForRenderIdle() noexcept;
    // 🔥 FIX (2026-11-10, P-M7): aplikasikan fade-in (awal track) dan
    // fade-out (ekor, saat decoderFinished_) ke buffer output render().
    // Dipanggil di akhir render(), setelah zero-fill dan clock.
    // inputReadSamples = sample yang dibaca dari queue callback ini,
    // rate = laju playback (fade-out dihitung dalam frame OUTPUT).
    void applyTrackFades(float* output, uint32_t frames, uint32_t channels,
                         size_t inputReadSamples, float rate) noexcept;
    void updatePlaybackState();

    std::atomic<bool> initialized_{false};
    std::atomic<bool> playing_{false};
    // 🔥 DIPANGKAS (2026-11-10, dead-code playback): stopping_ dihapus —
    // hanya ditulis shutdown(), tidak pernah dibaca (write-only).
    TrackInfo currentTrack_{};

    std::shared_ptr<PlaybackState> state_;
    std::shared_ptr<PlaybackClock> clock_;
    std::shared_ptr<PCMQueue> pcmQueue_;

    // Metrik engine (AudioEngine::mMetrics) — pointer mentah, bukan owner.
    // Diset sekali dari EngineManager; AudioEngine hidup selama app (anggota
    // singleton EngineManager), jadi pointer ini tidak pernah dangling.
    // Dipakai untuk mencatat overrun di decode callback (M5, 2026-11-10).
    pristine::AudioMetrics* metricsEngine_{nullptr};

    // Dipanggil setiap loadTrack() berhasil (M1, 2026-11-10). Diset sekali
    // dari EngineManager. std::function dibaca tanpa lock — hanya ditulis
    // sekali di konstruksi EngineManager, sebelum ada loadTrack.
    std::function<void()> trackLoadedListener_;
    std::atomic<bool> clearing_{false};

    // 🔥 FIX (2026-11-10, p-m12): jumlah render() yang sedang berjalan
    // (audio thread). loadTrack/stop/seek menunggu angka ini 0 setelah
    // mengibarkan clearing_ — ganti sleep 10 ms yang tidak menjamin
    // in-flight render selesai (periode callback ~20 ms).
    std::atomic<int> renderActive_{0};

    // 🔥 FIX (2026-11-10, P-M7): fade-in di awal track + fade-out di ekor.
    // Kurva dibuat loadTrack() (bukan audio thread — generateCurve
    // mengalokasi vector) dan HANYA dibaca render() saat clearing_ false,
    // jadi tidak ada race dengan loadTrack (waitForRenderIdle menunggu
    // render selesai sebelum kurva dibuat ulang).
    FadeEngine fadeIn_;
    FadeEngine fadeOut_;
    // PB6-W4 (2026-11-12): fade-out saat pause — 15 ms, S-curve.
    //
    // pause() dulu memotong langsung: playing_=false lalu render
    // mengisi senyap — diskontinuitas amplitudo = klik. Sekarang pause()
    // mempersenjatai fade (kurva dibuat di sana, thread JS) dan render()
    // yang meramp-down-kan output selama 15 ms sebelum benar-benar
    // senyap. playing_ SENGAJA tetap true selama fade; render yang
    // men-store false + updatePlaybackState saat fade habis.
    //
    // Durasi 15 ms = titik tengah rentang 10–20 ms tugas: 720 frame
    // @48 kHz = ~1,5 callback (480 frame), jadi ramp benar-benar
    // tersampel lintas callback, bukan satu lompatan; tetap di bawah
    // dipakai PB6-W1 — telinga tidak mendengarnya sebagai fade, hanya
    // hilangnya klik. Ramp anti-klik, bukan fade musikal: berlaku di
    // kedua mode (bit-perfect pun memakai fade anti-klik 10 ms di
    // loadTrack, PB6-W1).
    //
    // State fade = dua atomic (bukan satu): total_ = panjang kurva,
    // remaining_ = sisa frame yang belum di-fade. Render mengklaim
    // kemajuan dengan CAS atas remaining_ (lihat blok fade di render()):
    // play()/stop()/seek()/loadTrack() membatalkan fade dengan store(0),
    // dan load-lalu-store render bisa menimpa 0 itu dengan sisa basi —
    // resume lalu dibungkam lagi setelah satu callback.
    //
    // Kurva (pauseFade_) HANYA ditulis pause() saat remaining_ == 0
    // (tidak ada render yang membacanya) dan HANYA dibaca render()
    // saat remaining_ > 0 — plus waitForRenderIdle() di pause()
    // sebelum regenerate, untuk menutup jendela callback terakhir yang
    // sudah mengklaim sisa 0 tapi masih di dalam applyFadeOut.
    // play()/stop()/seek()/loadTrack() hanya me-store 0 ke remaining_,
    // tidak pernah menyentuh kurva.
    static constexpr uint32_t kPauseFadeMs = 15;
    FadeEngine pauseFade_;
    std::atomic<uint32_t> pauseFadeTotalFrames_{0};
    std::atomic<uint32_t> pauseFadeRemainingFrames_{0};
    // Frame yang sudah di-render sejak loadTrack/seek/play terakhir.
    // Di-increment render() (audio thread), di-reset loadTrack/seek/play.
    // Dihitung dalam frame OUTPUT (bukan input — di 2x, 300 ms output =
    // 600 ms input; durasi fade adalah durasi yang didengar).
    std::atomic<uint32_t> framesSinceLoad_{0};

    // PB6-W2C (2026-11-12): total sampel NaN/Inf/|x|>2 yang dibersihkan
    // safety net render() — lihat nanCleanedTotal(). Atomic supaya
    // render() (audio thread) dan thread polling JNI bisa berbagi tanpa
    // lock; fetch_add relaxed cukup (hanya statistik, tanpa urutan
    // terhadap operasi lain).
    std::atomic<uint32_t> mNanTotal_{0};

    // 🔥 FIX (2026-11-10, P-M9): WSOLA time-stretch untuk laju playback.
    // playbackRate_ = target dari JS (atomic, ditulis thread JS, dibaca
    // audio thread). rateApplied_ = laju yang sedang dipakai prosesor
    // (HANYA audio thread yang menulis — render() menerapkan perubahan
    // laju di sana supaya reset buffer tidak race dengan push/pull).
    // rateScratch_ = buffer baca sementara saat rate != 1.0 (input dibaca
    // dari queue ke sini dulu, baru didorong ke prosesor).
    PlaybackRateProcessor rateProcessor_;
    std::atomic<float> playbackRate_{1.0f};
    float rateApplied_ = 1.0f;

    // PB6-W2B (2026-11-12): kapasitas rateScratch_ — pre-alokasi di
    // initialize() supaya render() (noexcept, audio thread) tidak pernah
    // resize() (bad_alloc di noexcept = terminate). Batasnya adalah
    // frame callback Oboe PENUH, bukan kMaxFramesPerCallback (1920):
    // AudioCallback memanggil render() dengan numFrames penuh SEBELUM
    // chunking kMax di applyPipeline, jadi satu callback
    // bisa sebesar burst Oboe — 3840 frame @192 kHz (burst 20 ms,
    // C-C2 di AudioCallback.cpp). 4096 frame menutup burst itu dengan
    // margin × laju maks 2.0 (setPlaybackRate/setRate) × 2 channel
    // stereo (AudioCallback memanggil render() dengan channels=2)
    // + 64 slack pembulatan (inputFrames = frames*rate+0.5).
    // 7744 (= 1920×2×2+64) TIDAK cukup: burst 3840 frame @192 kHz
    // @2,0x butuh 15360 sampel — guard lama membisukan SETIAP callback.
    // render() meng-guard: inputSamples di atas kapasitas → senyap,
    // bukan resize (lihat render()).
    static constexpr size_t kRateScratchSamples = 4096 * 2 * 2 + 64;  // 16448 (~66 KB float)
    std::vector<float> rateScratch_;

    // 🔥 FASE R (2026-11-11): retune (PitchShifter, phase vocoder).
    // pitchRatio_ = target dari JS (atomic, ditulis thread JS, dibaca audio
    // thread). pitchApplied_ = rasio efektif yang sedang dipakai prosesor
    // (HANYA audio thread yang menulis).
    //
    // PB6-W1 (2026-11-12): processingAllowed_ = false di mode bit-perfect
    // (diset EngineManager::setProcessingMode) — gerbang umum SEMUA
    // processing di PlaybackController, bukan cuma pitch: rasio pitch
    // efektif jadi 1.0 (bypass) walau pitchRatio_ bukan 1.0, laju playback
    // efektif jadi 1.0 walau playbackRate_ bukan 1.0, dan fade track
    // dipersingkat ke 10 ms anti-klik (lihat loadTrack()).
    PitchShifter pitchShifter_;
    std::atomic<float> pitchRatio_{1.0f};
    float pitchApplied_ = 1.0f;
    std::atomic<bool> processingAllowed_{true};

    // Laju stream aktual (dari device/DAC). 0 = belum diketahui.
    std::atomic<uint32_t> streamSampleRate_{0};

    // Laju FILE yang diminta (metadata track). 0 = belum diketahui.
    // Terpisah dari streamSampleRate_ karena keduanya memang berbeda sampai
    // stream berhasil dibuka di laju file.
    std::atomic<uint32_t> fileSampleRate_{0};

    // Laju target decoder yang sedang berjalan (cfg.targetSampleRate dari
    // startDecoder). 0 = tidak ada decoder. Dipakai
    // reloadIfDecoderRateMismatch() (D-M2, 2026-11-11) untuk mendeteksi
    // decoder yang dibuat saat stream masih 0.
    std::atomic<uint32_t> decoderTargetRate_{0};

    std::shared_ptr<TrackQueue> queue_;

    // 🔥 FIX (2026-11-10, P-M4): shared_ptr, BUKAN unique_ptr.
    //
    // Pembaca (play/pause/seek/render/decode callback) menyalin pointer di
    // bawah lock singkat, lalu memakai salinan TANPA lock — objek tetap hidup
    // lewat shared ownership walau stopDecoder() sudah mengganti member.
    // Pola cek-lalu-pakai unique_ptr tanpa lock sebelumnya adalah TOCTOU
    // (baca bisa mendarat di antara move-out dan reset → deref null).
    std::shared_ptr<decoder::DecoderWorker> decoderWorker_;

    // 🔥 FIX (2026-11-11, D-M3): serialisasi loadTrack() antar thread.
    //
    // loadTrack() dipanggil dari thread JS (next/previous/play) DAN dari
    // advance thread (scheduleAdvance). Tanpa mutex, dua startDecoder()
    // bisa berjalan bersamaan pada worker berbeda — keduanya menulis ke
    // PCMQueue yang SPSC dan track yang berbunyi bisa beda dari indeks
    // queue. cancelPendingAdvance() hanya menutup jendela drain-wait, bukan
    // jendela antara cek-batal terakhir dan loadTrack() itu sendiri.
    //
    // RECURSIVE (bukan mutex biasa): play() memanggil loadTrack() di
    // bawah saat needsLoad sambil lock sudah dipegang (PB2-M1). Dulu
    // rantai listener juga bersarang di sini — loadTrack() →
    // trackLoadedListener → onTrackLoaded() → reopen sinkron → loadTrack()
    // lagi di thread yang sama — tapi reopen dari listener itu dilarang
    // sejak PB6-B1 (urutan lock terbalik, deadlock ABBA).
    std::recursive_mutex loadTrackMutex_;

    // 🔥 FIX (2026-10-09, crash auto-advance): decoderWorker_ dibaca dari
    // audio thread (render()) dan ditulis ulang oleh advanceThread (loadTrack
    // → stopDecoder → reset + make_unique). Lock ini menyinkronkan keduanya.
    // recursive supaya aman jika loadTrack dipanggil dari thread yang sedang
    // memegang lock (mis. sync dari seek). mutable supaya hasDecoder() const
    // dan snapshotWorker() const bisa menguncinya.
    mutable std::recursive_mutex decoderMutex_;

    // Salinan decoderWorker_ saat ini, diambil di bawah decoderMutex_.
    // Dipakai play/pause/seek/render supaya tidak pernah membaca unique_ptr
    // (dulu) / member mentah tanpa lock (P-M4).
    [[nodiscard]] std::shared_ptr<decoder::DecoderWorker> snapshotWorker() const;

    // PB6-W3 (2026-11-12): SATU worker thread permanen untuk advance queue
    // setelah EOF — menggantikan advanceThread_ yang di-spawn/join per advance.
    //
    // Masalah advanceThread_ lama:
    //  1. scheduleAdvance() (thread decoder) me-join thread lama TANPA mutex
    //     — assign + join tanpa sinkronisasi = data race, dan join ganda
    //     (stop()/shutdown() ikut me-join) melempar std::system_error yang
    //     tak tertangkap → terminate. Join dari thread decoder juga bisa
    //     menggantung ~20 dtk kalau advance lama sedang drain-wait
    //     (stopDecoder ikut menggantung).
    //  2. Jendela skip dobel: advance thread yang sudah lolos cek-batal
    //     terakhir tetap advance()+loadTrack() SESUDAH next()/previous()
    //     (advanceManual() dulu, loadTrack() baru membatalkan) — indeks
    //     geser dua kali untuk satu tekanan Next.
    //
    // Desain baru: scheduleAdvance() HANYA mem-post permintaan (URI trek
    // yang berakhir) ke slot yang dijaga advanceMutex_ + advanceCv_ —
    // tanpa join, tanpa lock lain, jadi aman dipanggil dari callback EOF /
    // decode-error di thread decoder. Worker menunggu di CV, lalu
    // menjalankan drain-wait + advance + loadTrack sendiri.
    //
    // Penutup skip dobel ada tiga lapis:
    //  (a) next()/previous() memanggil cancelPendingAdvance() DULU lalu
    //      memegang loadTrackMutex_ sepanjang advanceManual()/retreat() +
    //      loadTrack(); worker memegang mutex yang sama sepanjang
    //      advance() + loadTrack() (termasuk retry P-M10). Keduanya atomik
    //      satu sama lain — tidak ada interleaving indeks-vs-muatan.
    //  (b) cancelPendingAdvance() mengambil loadTrackMutex_ sebentar saat
    //      menaikkan flag. Jadi flag yang dibaca worker SETELAH mengambil
    //      mutex (di dalam seksi kritis) melihat SEMUA cancel yang terjadi
    //      sebelum akuisisi itu (sinkronisasi mutex unlock→lock), dan
    //      cancel yang datang sesudahnya ter-block sampai seksi kritis
    //      selesai. Tanpa (b), cancel yang mendarat di antara cek-batal
    //      worker dan advance() tetap lolos — itulah jendela yang ditutup.
    //  (c) scheduleAdvance() menolak permintaan yang URInya sudah bukan
    //      track aktif: callback decoder lama yang tertunda (post-nya
    //      mendarat SESUDAH cancel next()/previous()) tidak boleh
    //      menghidupkan advance — post seperti itu membersihkan flag
    //      lewat jalurnya sendiri, jadi flag saja tidak menutupnya.
    //
    // Urutan lock: advanceMutex_ adalah leaf — hanya diambil sebentar
    // untuk post/ambil permintaan dan untuk menunggu di CV; TIDAK PERNAH
    // ditahan saat mengambil loadTrackMutex_ (worker melepasnya dulu),
    // dan tidak ada mutex lain yang diambil saat memegangnya. Jadi tidak
    // ada urutan lock baru terhadap loadTrackMutex_/decoderMutex_/
    // decodeMutex_. scheduleAdvance() dari thread decoder (yang sedang
    // memegang decodeMutex_ di workerLoop) hanya mengambil advanceMutex_
    // + decoderMutex_ (cek URI, pola yang sama dengan pembacaan
    // currentTrack_.uri di callback EOF) — tidak ada jalur balik
    // decoderMutex_ -> decodeMutex_ (stopDecoder melepas decoderMutex_
    // sebelum worker->stop()).
    std::thread advanceWorker_;
    std::mutex advanceMutex_;
    std::condition_variable advanceCv_;
    // Dijaga advanceMutex_: permintaan advance yang menunggu diproses.
    bool advancePending_{false};
    std::string advanceFinishedUri_;
    // Dijaga advanceMutex_: worker diminta berhenti (shutdown).
    bool advanceStopRequested_{false};
    // Dijaga advanceMutex_: worker sedang memproses satu permintaan.
    // Dipakai stop() (waitForAdvanceIdle) untuk menunggu advance in-flight
    // selesai SEBELUM mengambil loadTrackMutex_ — PB2-M1: lock HANYA
    // sesudah advance selesai, jadi stop() tidak pernah memegang mutex
    // sambil menunggu worker.
    bool advanceBusy_{false};

    // 🔥 FIX (2026-11-10, P-M1): decoder sudah selesai membaca file (EOF),
    // tapi audio di queue belum habis dimainkan. Di-set EOF callback,
    // di-clear loadTrack()/startDecoder(). Dipakai render() untuk fade-out
    // ekor track (P-M7) dan advance thread untuk tahu kapan drain selesai.
    std::atomic<bool> decoderFinished_{false};

    // 🔥 FIX (2026-11-10, P-M1/P-M3): batalkan advance yang sedang menunggu
    // drain. Di-set stop()/loadTrack()/shutdown(), di-clear scheduleAdvance()
    // saat advance baru dimulai. Tanpa ini, advance yang dijadwalkan EOF bisa
    // menghidupkan lagi audio setelah user menekan stop atau pindah track
    // manual di tengah ekor track.
    std::atomic<bool> advanceCancelled_{false};

    // 🔥 FIX (2026-10-06): anti-flood EOF. Lihat setEofCallback di
    // PlaybackController.cpp — trek korup/0-byte bikin decoder EOF berulang
    // dan menembak event ke JS ratusan kali per detik.
    //
    // ⚠️ JANGAN pakai std::atomic<std::string> — std::atomic hanya untuk
    // tipe trivially copyable, dan std::string bukan itu. NDK clang
    // menolak: "std::atomic<T> requires that 'T' be a trivially copyable
    // type" (build 37399429037, 01:47 UTC). Pakai mutex biasa.
    std::mutex eofMutex_;
    std::string lastEofUri_;
    std::chrono::steady_clock::time_point lastEofTime_;
};

} // namespace pristine::playback