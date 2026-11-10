#pragma once

#include <memory>
#include <atomic>
#include <chrono>
#include <functional>
#include <mutex>
#include <string>
#include <vector>
#include "PlaybackState.h"
#include "PlaybackMetrics.h"
#include "PlaybackClock.h"
#include "PCMQueue.h"
#include "PlaybackTypes.h"
#include "TrackQueue.h"
#include "FadeEngine.h"
#include "PlaybackRateProcessor.h"
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
    // DeviceRateDetector::pickBestRate(). Tanpa ini tidak ada jalur yang
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

    // State accessors
    std::shared_ptr<PlaybackState> state() const noexcept;
    std::shared_ptr<MetricsCollector> metrics() const noexcept;
    std::shared_ptr<PlaybackClock> clock() const noexcept;
    std::shared_ptr<PCMQueue> pcmQueue() const noexcept;

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
    // Lihat implementasi: harus di thread terpisah supaya tidak self-join.
    // finishedUri = URI trek yang baru berakhir (untuk event ke JS — di-emit
    // SETELAH ekor habis dimainkan, bukan saat EOF, P-M1).
    void scheduleAdvance(const std::string& finishedUri);
    // 🔥 FIX (2026-11-10, P-M1): batalkan advance yang sedang menunggu drain.
    // Dipanggil stop()/loadTrack()/shutdown() sebelum pekerjaan mereka.
    void cancelPendingAdvance() noexcept;
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
    std::atomic<bool> stopping_{false};
    TrackInfo currentTrack_{};

    std::shared_ptr<PlaybackState> state_;
    std::shared_ptr<MetricsCollector> metrics_;
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
    // Frame yang sudah di-render sejak loadTrack/seek/play terakhir.
    // Di-increment render() (audio thread), di-reset loadTrack/seek/play.
    // Dihitung dalam frame OUTPUT (bukan input — di 2x, 300 ms output =
    // 600 ms input; durasi fade adalah durasi yang didengar).
    std::atomic<uint32_t> framesSinceLoad_{0};

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
    std::vector<float> rateScratch_;

    // Laju stream aktual (dari device/DAC). 0 = belum diketahui.
    std::atomic<uint32_t> streamSampleRate_{0};

    // Laju FILE yang diminta (metadata track). 0 = belum diketahui.
    // Terpisah dari streamSampleRate_ karena keduanya memang berbeda sampai
    // stream berhasil dibuka di laju file.
    std::atomic<uint32_t> fileSampleRate_{0};

    std::shared_ptr<TrackQueue> queue_;

    // 🔥 FIX (2026-11-10, P-M4): shared_ptr, BUKAN unique_ptr.
    //
    // Pembaca (play/pause/seek/render/decode callback) menyalin pointer di
    // bawah lock singkat, lalu memakai salinan TANPA lock — objek tetap hidup
    // lewat shared ownership walau stopDecoder() sudah mengganti member.
    // Pola cek-lalu-pakai unique_ptr tanpa lock sebelumnya adalah TOCTOU
    // (baca bisa mendarat di antara move-out dan reset → deref null).
    std::shared_ptr<decoder::DecoderWorker> decoderWorker_;

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

    // 🔥 Thread untuk advance queue setelah EOF (lihat scheduleAdvance).
    std::thread advanceThread_;

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