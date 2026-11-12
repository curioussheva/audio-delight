#include "PlaybackController.h"
#include "NativeEventEmitter.h"

#include "../decoder/FFmpegDecoder.h"

#include <algorithm>
#include <cmath>
#include <thread>
#include <chrono>
#include <android/log.h>

namespace pristine::playback {

// =====================================================
// CONSTRUCTOR / DESTRUCTOR
// =====================================================

PlaybackController::PlaybackController() = default;

PlaybackController::~PlaybackController() {
    shutdown();
}

// =====================================================
// LIFECYCLE
// =====================================================

bool PlaybackController::initialize() {
    if (initialized_.load(std::memory_order_acquire))
        return true;

    __android_log_print(ANDROID_LOG_INFO, "PlaybackController", "initialize called");

    // PB6-MINOR(c) (2026-11-12): 2^22 = 4194304 float samples (16 MiB).
    // Kapasitas dihitung dalam SAMPEL, jadi durasinya tergantung laju:
    // ~43,7 dtk stereo @48k, ~21,8 dtk @96k, ~10,9 dtk @192k, ~5,5 dtk
    // @384k. Naik dari 2^21 (8 MiB): di sana file 192k/384k hanya
    // menampung 5,5/2,7 dtk — terlalu pendek sebagai lookahead saat
    // render starve sesaat. Biaya: +8 MiB sekali di initialize() —
    // diterima (satu alokasi, bukan per track). Ambang backpressure
    // (pause 90% / resume 60%, lihat startDecoder) dihitung sebagai
    // FRAKSI kapasitas, jadi menaikkan kapasitas tidak mengubah perilaku
    // ambang — hanya durasi absolut buffer.
    // WAJIB power of 2: PCMQueue pakai bitmask, bukan modulo!
    pcmQueue_ = std::make_shared<PCMQueue>(1 << 22);  // 🔥 43.7s buffer @48k
    clock_ = std::make_shared<PlaybackClock>();
    state_ = std::make_shared<PlaybackState>();
    queue_ = std::make_shared<TrackQueue>();

    // PB6-W2B (2026-11-12): pre-alokasi rateScratch_ (kRateScratchSamples,
    // lihat header) — initialize() bukan audio thread, jadi alokasi di sini
    // aman; render() (noexcept) tidak boleh resize.
    rateScratch_.assign(kRateScratchSamples, 0.0f);

    // PB6-W3 (2026-11-12): nyalakan SATU worker advance permanen (lihat
    // komentar advanceWorker_ di header). Di-start di AKHIR initialize() —
    // sesudah pcmQueue_/queue_ ada — supaya worker tidak pernah melihat
    // resource null. Pembuatan thread adalah titik sinkronisasi: semua
    // tulis di atas terlihat oleh worker.
    {
        std::lock_guard<std::mutex> lock(advanceMutex_);
        advanceStopRequested_ = false;
        advancePending_ = false;
        advanceBusy_ = false;
        advanceFinishedUri_.clear();
    }
    advanceWorker_ = std::thread(&PlaybackController::advanceWorkerLoop, this);

    initialized_.store(true, std::memory_order_release);
    return true;
}

void PlaybackController::shutdown() {
    if (!initialized_.exchange(false))
        return;

    // 🔥 FIX (2026-11-10, P-M1): batalkan dulu advance yang sedang menunggu
    // drain — kalau tidak, join di bawah menggantung selamanya (tidak ada
    // render() lagi yang menguras queue).
    cancelPendingAdvance();

    // PB6-W3: hentikan worker permanen — minta berhenti + notify + join
    // SEKALI. Join di sini (destruktor, thread pemilik EngineManager),
    // BUKAN dari thread decoder: satu-satunya pemanggil shutdown() adalah
    // ~PlaybackController() (EngineManager singleton dihancurkan saat
    // process exit, sesudah mEngine.stop() di body destruktor — PB6-W6),
    // dan tidak ada jalur dari thread decoder / worker advance itu sendiri
    // ke shutdown(). Worker menyelesaikan permintaan in-flight yang
    // terbatas (drain sudah dibatalkan di atas; seksi kritis
    // advance+loadTrack terbatas) lalu keluar.
    //
    // Urutan: join worker DULU, baru stopDecoder. Worker yang sedang
    // loadTrack() bisa mempublikasikan decoder baru SESUDAH stopDecoder
    // kalau urutannya dibalik (dulu: stopDecoder dulu, join sesudahnya) —
    // decoder itu lalu hidup melewati shutdown tanpa pernah di-stop.
    {
        std::lock_guard<std::mutex> lock(advanceMutex_);
        advanceStopRequested_ = true;
    }
    advanceCv_.notify_all();
    if (advanceWorker_.joinable()) {
        advanceWorker_.join();
    }

    stopDecoder();

    playing_.store(false);
    // PB6-W4: batalkan fade-out pause yang sedang berjalan.
    pauseFadeRemainingFrames_.store(0, std::memory_order_release);

    pcmQueue_.reset();
    clock_.reset();
    state_.reset();
    queue_.reset();
}

// =====================================================
// STATE ACCESSORS
// =====================================================

bool PlaybackController::isInitialized() const noexcept {
    return initialized_.load(std::memory_order_acquire);
}

std::shared_ptr<PlaybackState> PlaybackController::state() const noexcept {
    return state_;
}

std::shared_ptr<TrackQueue> PlaybackController::queue() const noexcept {
    return queue_;
}

bool PlaybackController::hasDecoder() const noexcept {
    // 🔥 FIX (2026-11-10, P-M4): baca di bawah lock. Dulu baca member mentah
    // tanpa lock dari JNI sementara stopDecoder() memindahkannya.
    std::lock_guard<std::recursive_mutex> lock(decoderMutex_);
    return decoderWorker_ != nullptr;
}

std::shared_ptr<decoder::DecoderWorker> PlaybackController::snapshotWorker() const {
    std::lock_guard<std::recursive_mutex> lock(decoderMutex_);
    return decoderWorker_;
}

// =====================================================
// QUEUE & NAVIGATION
// =====================================================

bool PlaybackController::next() {
    if (!queue_) return false;

    // PB6-W3: batalkan advance DULU (sebelum lock) supaya flag terlihat
    // worker sebelum thread ini ter-block di mutex (pola D-M3), lalu
    // pegang loadTrackMutex_ sepanjang advanceManual()+loadTrack().
    // Worker advance memegang mutex yang sama sepanjang advance()+
    // loadTrack() (lihat processAdvance), jadi navigasi manual dan
    // auto-advance atomik satu sama lain dan skip dobel tertutup:
    // worker yang kalah perebutan mutex melihat flag-batal di dalam
    // seksi kritisnya dan urung; yang menang menyelesaikan advance-nya
    // dulu, baru thread ini advanceManual dari indeks BARU (satu
    // auto-advance + satu manual = dua langkah yang memang diminta,
    // bukan satu Next yang melompat dua).
    //
    // Aman memegang mutex di sini: listener loadTrack() tidak lagi reopen
    // sinkron sejak PB6-B1 (onTrackLoaded hanya meminta recovery async
    // lewat requestStreamRecovery, tanpa lock).
    cancelPendingAdvance();
    std::lock_guard<std::recursive_mutex> lock(loadTrackMutex_);

    // 🔥 FIX (2026-10-10): pakai advance(), BUKAN next() (peek const).
    //
    // BUG: next() sebelumnya memanggil queue_->next() yang adalah peeker
    // const — mengembalikan queue[idx+1] TANPA memperbarui mCurrentIndex.
    // Audio berpindah ke trek berikutnya (loadTrack jalan), tapi pointer
    // internal queue masih di trek lama.
    //
    // Konsekuensi:
    //   1. getCurrentTrack()/current() masih laporkan trek lama → UI mismatch
    //      ("lagu di UI ≠ lagu yang diputar").
    //   2. Auto-advance EOF berikutnya memanggil advance() yang menambah
    //      mCurrentIndex dari POSISI LAMA — melompati trek atau memutar trek
    //      sama dua kali (log: playSong A, next → B, lalu EOF advance dari
    //      index 0 → B lagi).
    //
    // advance() memperbarui mCurrentIndex sesuai repeat mode, lalu current()
    // memberikan trek yang benar. Sama seperti yang scheduleAdvance() lakukan
    // untuk auto-advance EOF.
    //
    // 🔥 FIX (2026-11-10, P-M5): tombol Next pakai advanceManual(), BUKAN
    // advance(). advance() dengan Repeat One return true TANPA bergerak
    // (benar untuk EOF: lagu yang sama diulang), jadi Next me-restart lagu
    // yang sama. advanceManual() selalu maju satu langkah apa pun repeat
    // mode-nya.
    if (!queue_->advanceManual()) return false;

    auto track = queue_->current();
    if (track) {
        return loadTrack(*track);
    }
    return false;
}

bool PlaybackController::previous() {
    if (!queue_) return false;

    // PB6-W3: sama dengan next() — batalkan advance dulu, lalu pegang
    // loadTrackMutex_ sepanjang retreat()+loadTrack() supaya atomik
    // terhadap advance()+loadTrack() worker (lihat komentar di next()).
    cancelPendingAdvance();
    std::lock_guard<std::recursive_mutex> lock(loadTrackMutex_);

    // 🔥 FIX (2026-10-10): pakai retreat(), BUKAN previous() (peek const).
    // Alasan sama dengan next(): previous() const hanya peek queue[idx-1]
    // tanpa memperbarui mCurrentIndex. Keluhan "previous cuma seek awal,
    // lagu tidak berubah" berasal dari sini — loadTrack jalan, tapi queue
    // pointer tidak mundur, sehingga trek setelahnya kacau.
    if (!queue_->retreat()) return false;

    auto track = queue_->current();
    if (track) {
        return loadTrack(*track);
    }
    return false;
}

void PlaybackController::setShuffle(bool enabled) {
    if (queue_) queue_->setShuffleMode(enabled ? ShuffleMode::On : ShuffleMode::Off);
}

void PlaybackController::setRepeatMode(RepeatMode mode) {
    if (queue_) queue_->setRepeatMode(mode);
}

// 🔥 FIX (2026-11-10, P-M9): laju playback (WSOLA time-stretch).
//
// Hanya menyimpan target ke atomic — penerapan (reset buffer WSOLA)
// dilakukan render() di audio thread, karena vector prosesor tidak boleh
// di-clear dari thread JS sementara render() sedang push/pull. Perubahan
// laju efektif paling lambat satu callback (~10–20 ms) setelah panggilan.
// Rentang 0.5–2.0 = rentang UI; di luar itu / non-finite diabaikan.
void PlaybackController::setPlaybackRate(float rate) noexcept {
    if (!std::isfinite(rate) || rate < 0.5f || rate > 2.0f) {
        __android_log_print(ANDROID_LOG_WARN, "PlaybackController",
                            "setPlaybackRate: laju %.2f di luar 0.5-2.0, "
                            "diabaikan", rate);
        return;
    }
    const float old = playbackRate_.exchange(rate, std::memory_order_acq_rel);
    if (old != rate) {
        __android_log_print(ANDROID_LOG_INFO, "PlaybackController",
                            "setPlaybackRate: %.2fx (sebelumnya %.2fx)",
                            rate, old);
    }
}

float PlaybackController::playbackRate() const noexcept {
    return playbackRate_.load(std::memory_order_acquire);
}

// 🔥 FASE R (2026-11-11): retune (phase vocoder pitch shift).
//
// Hanya menyimpan target ke atomic — penerapan (reset buffer pitch
// shifter) dilakukan render() di audio thread, karena vector prosesor
// tidak boleh di-clear dari thread JS sementara render() sedang push/pull.
// Perubahan rasio efektif paling lambat satu callback (~10–20 ms) setelah
// panggilan. Rentang 0.5–2.0 = ±1 oktaf; A=432 = 432/440 = 0.98182.
void PlaybackController::setPitchRatio(float ratio) noexcept {
    if (!std::isfinite(ratio) || ratio < 0.5f || ratio > 2.0f) {
        __android_log_print(ANDROID_LOG_WARN, "PlaybackController",
                            "setPitchRatio: rasio %.4f di luar 0.5-2.0, "
                            "diabaikan",
                            ratio);
        return;
    }
    const float old = pitchRatio_.exchange(ratio, std::memory_order_acq_rel);
    if (old != ratio) {
        __android_log_print(ANDROID_LOG_INFO, "PlaybackController",
                            "setPitchRatio: %.4f (sebelumnya %.4f)", ratio,
                            old);
    }
}

float PlaybackController::pitchRatio() const noexcept {
    return pitchRatio_.load(std::memory_order_acquire);
}

// Gate bit-perfect (Fase R + PB6-W1): processing (retune, laju playback,
// fade track) tidak boleh jalan penuh di mode bit-perfect. Dipanggil
// EngineManager::setProcessingMode(). Hanya atomic store — render() yang
// menerapkan rate/pitch (reset buffer di sana) dan memilih set kurva
// fade per callback (B8-M1); loadTrack() yang membangun kedua set kurva.
void PlaybackController::setProcessingAllowed(bool allowed) noexcept {
    processingAllowed_.store(allowed, std::memory_order_release);
}

// =====================================================
// TRANSPORT
// =====================================================

bool PlaybackController::loadTrack(const TrackInfo& track) {
    // 🔥 FIX (2026-11-11, D-M3): batalkan advance DULU, sebelum mengambil
    // loadTrackMutex_. Flag ini harus terlihat oleh iterasi skip-loop
    // advance thread SEBELUM thread ini mengambil lock untuk muatan
    // manual — kalau tidak, advance yang sudah lolos cek-batal terakhir
    // tetap memuat track basi setelah navigasi manual dimulai, dan
    // (karena mutex) muatannya bisa mendarat SETELAH muatan manual.
    // Catatan (PB6-W3, 2026-11-12): cancelPendingAdvance() BUKAN lagi
    // atomic store murni — ia mengambil loadTrackMutex_ (rekursif)
    // sebentar saat menaikkan flag. Jadi panggilan dari luar lock ini
    // bisa block sebentar di belakang load yang sedang berjalan; itu
    // aman (belum ada lock lain yang dipegang di sini, mutex rekursif),
    // dan flag tetap terpasang sebelum lock muatan di bawah diambil.
    cancelPendingAdvance();

    // 🔥 FIX (2026-11-11, D-M3): serialisasi loadTrack() antar thread JS +
    // advance (lihat loadTrackMutex_ di header). Lock dipegang sepanjang
    // fungsi — termasuk FFmpeg open — supaya dua decoder tidak pernah hidup
    // bersamaan menulis ke PCMQueue SPSC.
    std::lock_guard<std::recursive_mutex> loadLock(loadTrackMutex_);

    // 🔥 FIX (2026-11-12, B8-P2): naikkan epoch generasi SEBELUM
    // stopDecoder() — mulai titik ini post EOF dari decoder lama adalah
    // basi, termasuk callback yang sedang in-flight selama stopDecoder
    // (join menunggu callback selesai, jadi post-nya bisa mendarat
    // sesudah cancel di atas tapi sebelum publikasi track baru — cek
    // gen di scheduleAdvance menolaknya di sini, bukan baru di drain).
    // Decoder baru mengikat gen ini di lambda-nya saat startDecoder
    // di bawah, jadi post-nya sah. loadLock sudah dipegang: tidak ada
    // loadTrack()/stop() lain yang bisa menaikkan gen di antara bump
    // ini dan pembacaan startDecoder.
    loadGen_.fetch_add(1, std::memory_order_release);

    // PB6-W4: batalkan fade-out pause yang sedang berjalan. Kalau fade
    // sedang berjalan, user sudah menekan pause — playing_ masih true
    // selama fade, dan kalau dibiarkan true melewati ganti track, track
    // baru langsung berbunyi padahal user minta pause. Jadi niat pause
    // dipertahankan: matikan playing_ di sini (play() yang memanggil
    // loadTrack karena needsLoad akan menyalakannya lagi sesudah ini).
    // Render yang sedang di tengah callback fade melihat 0 lewat CAS
    // dan berhenti tanpa menulis sisa basi (lihat blok fade di render()).
    const bool wasPausing =
        pauseFadeRemainingFrames_.load(std::memory_order_acquire) > 0;
    pauseFadeRemainingFrames_.store(0, std::memory_order_release);
    if (wasPausing) {
        playing_.store(false, std::memory_order_release);
        updatePlaybackState();
    }

    if (!initialized_.load(std::memory_order_acquire)) {
        __android_log_print(ANDROID_LOG_ERROR, "PlaybackController",
                            "loadTrack(): FAILED - not initialized");
        return false;
    }

    __android_log_print(ANDROID_LOG_INFO, "PlaybackController",
                        "loadTrack(): START uri=%s", track.uri.c_str());

    // (Pembatalan advance sudah dilakukan di awal fungsi, sebelum lock —
    // lihat komentar D-M3 di atas. Dulu cancelPendingAdvance() ada di sini;
    // dipindah ke atas supaya flag terlihat sebelum thread ini ter-block
    // di loadTrackMutex_.)

    stopDecoder();
    clearing_.store(true, std::memory_order_seq_cst);
    // 🔥 FIX (2026-11-10, p-m12): tunggu in-flight render selesai, ganti
    // sleep 10 ms. Periode callback ~20 ms (960 frame @48 kHz), jadi sleep
    // 10 ms tidak menjamin render yang sudah lolos cek clearing_ selesai —
    // ia masih bisa copy slot basi selama 1 callback.
    waitForRenderIdle();

    // 🔥 FIX (2026-11-10, P-M4): tulis di bawah lock. EOF callback (thread
    // decoder), play(), dan updatePlaybackState() membaca currentTrack_ dari
    // thread lain — tulis mentah tanpa lock adalah data race std::string.
    {
        std::lock_guard<std::recursive_mutex> lock(decoderMutex_);
        currentTrack_ = track;
    }

    // 🔥 FIX (2026-10-07): bawa laju FILE ke EngineManager lewat controller.
    //
    // Ini titik di mana laju file akhirnya masuk ke jalur engine. loadTrack()
    // selalu dipanggil saat track dibuka (play/next/previous/jumpTo), jadi ini
    // tempat yang benar - bukan di JNI play(), yang hanya dipanggil sekali dan
    // tidak tahu track mana yang akan dimuat.
    //
    // EngineManager memakainya di start() berikutnya untuk memilih laju stream
    // lewat pickBestRate(). Kalau track.sampleRate == 0 (metadata tidak
    // terbaca) nilai ini menjadi 0 dan engine mendeteksi sendiri.
    setFileSampleRate(track.sampleRate);

    pcmQueue_->clear();
    clock_->reset();
    if (state_) state_->setPosition(0);  // 🔥 FIX: reset posisi state juga

    // 🔥 FIX (2026-11-10, P-M7): siapkan kurva fade untuk track baru —
    // fade-in di awal track, fade-out di ekor (saat decoder selesai, lihat
    // render()). Dibuat di sini (bukan audio thread) karena generateCurve
    // mengalokasi vector. Laju: stream kalau sudah diketahui, kalau tidak
    // laju file, kalau tidak 48000 — selisih beberapa ms tidak terdengar.
    //
    // PB6-W1 (2026-11-12): durasi fade sadar-mode. Di mode processing
    // (DSP/Solfeggio) tetap 300 ms in / 500 ms out seperti sebelumnya.
    // Di bit-perfect, fade HANYA anti-klik 10 ms in/out: fade 300/500 ms
    // adalah processing — ia mengubah amplitudo ~0,8 detik audio yang
    // seharusnya keluar apa adanya (dan memotong ekor/reverb tail).
    // 10 ms dipilih, bukan 5 ms: 10 ms = satu periode callback @48 kHz,
    // jadi fade-in selesai dalam callback pertama; ramp S-curve 480
    // sampel cukup landai untuk transient keras, sementara 5 ms (240
    // sampel) curamnya 2x tanpa manfaat — di bawah ~20 ms telinga tidak
    // lagi mendengar ramp sebagai fade, hanya hilangnya klik.
    // B8-M1 (2026-11-12): KEDUA set kurva dibangun di sini (bukan satu
    // dari processingAllowed_ saat load) — applyTrackFades() memilih
    // per callback dari processingAllowed_ saat itu, jadi track yang
    // di-load di DSP lalu di-seek/di-play di BitPerfect memakai fade
    // 10 ms, dan sebaliknya. Durasi tiap mode TIDAK berubah, hanya
    // mekanisme pemilihannya.
    {
        uint32_t fadeRate = streamSampleRate();
        if (fadeRate == 0) fadeRate = track.sampleRate;
        if (fadeRate == 0) fadeRate = 48000;
        fadeInProcessing_.generateCurve(FadeCurve::SCurve,
                                        fadeRate * 300 / 1000);
        fadeOutProcessing_.generateCurve(FadeCurve::SCurve,
                                         fadeRate * 500 / 1000);
        fadeInBitPerfect_.generateCurve(FadeCurve::SCurve,
                                        fadeRate * 10 / 1000);
        fadeOutBitPerfect_.generateCurve(FadeCurve::SCurve,
                                         fadeRate * 10 / 1000);
    }
    framesSinceLoad_.store(0, std::memory_order_release);
    // B8-P4: reset throttle self-heal durasi — callback pertama track
    // baru langsung mencoba heal (counter 0), baru sesudahnya tiap
    // ~128 callback selama durasi masih 0 (lihat render()).
    durationHealCounter_.store(0, std::memory_order_release);
    // 🔥 FIX (2026-11-10, P-M9): buang sisa WSOLA track lama (audio basi
    // tidak boleh keluar di track baru). Aman di sini: clearing_ +
    // waitForRenderIdle sudah memastikan render() tidak sedang push/pull.
    rateProcessor_.reset();
    pitchShifter_.reset();  // Fase R: buang sisa pitch shifter juga

    // 🔥 FIX: set duration dari metadata track
    if (state_ && track.durationMs > 0) {
        state_->setDuration(static_cast<uint64_t>(track.durationMs));
    }

    // Decoder baru = file belum selesai dibaca. (P-M1: flag ini yang memberi
    // tahu render() bahwa ekor track sudah dekat untuk fade-out P-M7.)
    decoderFinished_.store(false, std::memory_order_release);

    bool result = startDecoder(track);
    clearing_.store(false, std::memory_order_release);

    // 🔥 FIX (2026-11-10, P-M8): isi durationFrames clock. Sebelumnya
    // setDurationFrames tidak punya pemanggil sehingga duration selalu 0
    // (progress() selalu 0.0, isNearEnd() selalu true, fallback durasi
    // decoder jalan tiap callback). Sumber: durasi decoder (paling akurat)
    // kalau ada, kalau tidak metadata track. Laju konversi: stream rate
    // kalau sudah diketahui, kalau tidak laju file, kalau tidak 48000
    // (domain frame clock = laju stream, lihat fix 2026-10-07 di seek()).
    if (result && clock_) {
        double durSec = 0.0;
        if (auto worker = snapshotWorker()) {
            durSec = worker->getDuration();
        }
        if (durSec <= 0.0 && track.durationMs > 0) {
            durSec = static_cast<double>(track.durationMs) / 1000.0;
        }
        if (durSec > 0.0) {
            uint32_t rate = streamSampleRate();
            if (rate == 0) rate = track.sampleRate;
            if (rate == 0) rate = 48000;
            clock_->setDurationFrames(
                static_cast<uint64_t>(durSec * rate));
        }
    }

    __android_log_print(ANDROID_LOG_INFO, "PlaybackController",
                        "loadTrack(): DONE startDecoder=%s",
                        result ? "true" : "false");

    // Beri tahu EngineManager: track baru berhasil dimuat. Kalau laju file
    // berubah, EngineManager membuka ulang stream di laju baru (M1) —
    // selama ini tidak ada yang melakukannya, jadi bit-perfect hilang
    // diam-diam di tiap pergantian track. Hanya saat berhasil; kalau decoder
    // gagal, tidak ada yang perlu di-reopen.
    if (result && trackLoadedListener_) {
        trackLoadedListener_();
    }

    return result;
}

bool PlaybackController::play() {
    // 🔥 FIX (2026-11-12, PB2-M1): serialisasi terhadap loadTrack().
    // play() menyentuh decoderWorker_/currentTrack_ yang sama dengan
    // loadTrack() — tanpa lock, play() dari thread JS bisa jalan bersamaan
    // dengan loadTrack() dari advance thread. play() memanggil loadTrack()
    // di bawah saat needsLoad — rekursif, aman karena loadTrackMutex_
    // rekursif.
    std::lock_guard<std::recursive_mutex> lock(loadTrackMutex_);

    if (!initialized_.load(std::memory_order_acquire)) {
        __android_log_print(ANDROID_LOG_ERROR, "PlaybackController",
                            "play(): FAILED - not initialized");
        return false;
    }

    if (!queue_) {
        __android_log_print(ANDROID_LOG_ERROR, "PlaybackController",
                            "play(): FAILED - queue_ null");
        return false;
    }

    auto track = queue_->current();
    if (!track) {
        __android_log_print(ANDROID_LOG_ERROR, "PlaybackController",
                            "play(): FAILED - queue_->current() null (size=%zu)",
                            queue_->tracks().size());
        return false;
    }

    // 🔥 FIX (2026-11-10, P-M4): snapshot worker + URI di bawah lock singkat,
    // lalu pakai salinan TANPA lock. Dulu cek-lalu-pakai decoderWorker_ /
    // currentTrack_ tanpa lock sementara loadTrack() (advanceThread) bisa
    // menggantinya di antara dua baca (TOCTOU). Lock TIDAK dipegang melewati
    // loadTrack() — itu akan mengembalikan masalah M3 (render ter-block
    // selama FFmpeg open).
    auto worker = snapshotWorker();
    std::string currentUri;
    {
        std::lock_guard<std::recursive_mutex> lock(decoderMutex_);
        currentUri = currentTrack_.uri;
    }
    // B8-P1+B9-play (2026-11-12): guard play() sesudah Completed.
    // Sesudah antrean habis (Repeat Off), worker masih ada + URI sama
    // → needsLoad=false → resume() no-op (worker EOF-idle; eof_ hanya
    // dilepas seek() / track baru) → UI "playing" tapi senyap.
    // finishedAndDrained = decoder sudah EOF DAN ekor queue sudah habis
    // terdengar → muat ulang track dari awal. Syarat
    // availableSamples()==0 penting: pause di tengah ekor (decoder
    // sudah EOF tapi ekor masih ter-buffer) harus resume dari ekor,
    // bukan restart. Memory order sama seperti pembaca
    // decoderFinished_ lain (acquire).
    const bool finishedAndDrained =
        decoderFinished_.load(std::memory_order_acquire) &&
        (!pcmQueue_ || pcmQueue_->availableSamples() == 0);
    bool needsLoad = !worker || track->uri != currentUri || finishedAndDrained;

    __android_log_print(ANDROID_LOG_INFO, "PlaybackController",
                        "play(): decoderWorker_=%s, needsLoad=%s, uri=%s",
                        worker ? "exists" : "null",
                        needsLoad ? "true" : "false",
                        track->uri.c_str());

    if (needsLoad) {
        __android_log_print(ANDROID_LOG_INFO, "PlaybackController",
                            "play(): track uri=%s, calling loadTrack",
                            track->uri.c_str());

        if (!loadTrack(*track)) {
            __android_log_print(ANDROID_LOG_ERROR, "PlaybackController",
                                "play(): FAILED - loadTrack returned false");
            return false;
        }
    }

    // 🔥 FIX (2026-11-10, P-M4): ambil ulang worker SETELAH loadTrack —
    // loadTrack bisa mengganti worker (decoder baru). Pakai snapshot, bukan
    // baca member mentah.
    worker = snapshotWorker();

    // 🔥 FIX: guard decoderWorker_ null (startDecoder bisa gagal silent)
    if (!worker) {
        __android_log_print(ANDROID_LOG_ERROR, "PlaybackController",
                            "play(): FAILED - decoderWorker_ null after needsLoad (uri=%s)",
                            track->uri.c_str());
        return false;
    }

    // PB6-MINOR(a) (2026-11-12): tangkap transisi paused->playing.
    // play() yang dipanggil saat SUDAH playing (double-tap tombol play,
    // MediaSession onPlay saat sinkronisasi JS) dulu me-reset
    // framesSinceLoad_ tanpa syarat — fade-in mulai lagi dari 0 di tengah
    // track = dip volume yang terdengar. Reset hanya saat transisi.
    // Yang tetap benar: track baru — loadTrack() di atas sudah me-reset
    // sendiri; dan resume di tengah fade-out pause (playing_ masih true,
    // PB6-W4) — fade-out dibatalkan di bawah dan audio lanjut tanpa
    // fade-in ulang, satu lompatan gain sekali jalan (jendela 15 ms)
    // alih-alih ramp 300 ms dari 0.
    const bool wasPlaying =
        playing_.exchange(true, std::memory_order_acq_rel);
    // PB6-W4: resume membatalkan fade-out pause yang sedang berjalan
    // (mis. play ditekan <15 ms sesudah pause). Render yang sudah
    // mengklaim sebagian fade lewat CAS melihat 0 dan berhenti.
    pauseFadeRemainingFrames_.store(0, std::memory_order_release);
    updatePlaybackState();  // 🔥 FIX

    // 🔥 FIX (2026-11-10, P-M7): resume dimulai dengan fade-in singkat
    // (300 ms di mode processing, 10 ms anti-klik di bit-perfect — set
    // kurva dipilih per callback dari processingAllowed_ saat itu, B8-M1;
    // kedua set dibangun loadTrack()) supaya tidak ada klik saat
    // audio jalan lagi setelah pause. loadTrack() sudah me-reset untuk
    // track baru; reset di sini hanya saat transisi paused->playing
    // (PB6-MINOR(a) di atas) — play() berulang saat sudah playing tidak
    // lagi me-restart fade-in.
    if (!wasPlaying) {
        framesSinceLoad_.store(0, std::memory_order_release);
    }

    // resume() di salinan aman walau stopDecoder() berjalan bersamaan:
    // resume() hanya atomic store + notify (lihat M3).
    worker->resume();

    __android_log_print(ANDROID_LOG_INFO, "PlaybackController",
                        "play(): SUCCESS");
    return true;
}

bool PlaybackController::pause() {
    // PB6-W4: serialisasi terhadap loadTrack() (PB2-M1) — pause() kini
    // menulis state fade (pauseFade_/pauseFadeTotalFrames_/
    // pauseFadeRemainingFrames_) yang dibersihkan loadTrack()/stop()/
    // seek(); tanpa lock, pause untuk track A bisa mempersenjatai fade
    // SESUDAH loadTrack(B) membersihkannya, lalu render mem-fade-out
    // awal track B. Recursive, jadi aman dari thread yang sudah
    // memegang mutex. Edge loadTrackMutex_ -> decodeMutex_ (worker->
    // pause() di bawah) sudah ada di seek()/play() — bukan urutan baru.
    std::lock_guard<std::recursive_mutex> lock(loadTrackMutex_);

    // Fade sudah berjalan: jangan regenerate kurva (render sedang
    // membacanya) — cukup kembalikan true. worker sudah di-pause oleh
    // panggilan pertama.
    if (pauseFadeRemainingFrames_.load(std::memory_order_acquire) > 0) {
        return true;
    }

    if (!playing_.load(std::memory_order_acquire)) {
        // Sudah paused/stopped — idempotent seperti sebelumnya.
        // 🔥 FIX (2026-11-10, P-M4): pakai snapshot, bukan baca member mentah.
        if (auto worker = snapshotWorker()) {
            worker->pause();
        }
        // 🔥 FIX (2026-11-12, B8-M5): jangan timpa Stopped/Completed jadi
        // Paused. updatePlaybackState() hanya tahu Playing/Paused (dari
        // playing_), jadi pause() sesudah stop()/completed mengubah status
        // jadi Paused. Sama seperti stop() (:767-770) yang sengaja TIDAK
        // memanggil updatePlaybackState — status Stopped / Completed
        // dipertahankan. Pause ganda saat Paused tetap memanggil
        // updatePlaybackState() seperti sebelumnya.
        if (state_) {
            const auto status = state_->getStatus();
            if (status != PlaybackStatus::Stopped &&
                status != PlaybackStatus::Completed) {
                updatePlaybackState();  // 🔥 FIX
            }
        }
        return true;
    }

    // PB6-W4 (2026-11-12): fade-out saat pause, BUKAN potong langsung.
    //
    // Dulu pause() memotong di sini juga (playing_=false) dan render
    // langsung mengisi senyap — diskontinuitas dari amplitudo sesaat ke
    // 0 = klik. Sekarang: kurva S-curve 15 ms (kPauseFadeMs, lihat
    // header) dibuat DI SINI (thread JS — generateCurve mengalokasi
    // vector, tidak boleh di render yang noexcept) dan dipersenjatai
    // lewat store remaining_ (release): render yang memuat remaining_
    // > 0 (acquire) melihat kurva yang sudah jadi, meramp-down-kan
    // output, lalu men-store playing_=false + updatePlaybackState saat
    // fade habis. playing_ SENGAJA tetap true sampai di sana — kalau
    // dimatikan di sini, render masuk cabang senyap dan fade tidak
    // pernah berbunyi. Status JS ikut tertunda ≤ ~2 callback (~15–30 ms),
    // tidak terlihat.
    //
    // waitForRenderIdle() sebelum regenerate: callback terakhir fade
    // SEBELUMNYA bisa saja sudah mengklaim sisa 0 lewat CAS (jadi
    // remaining_ terbaca 0 di atas) tapi masih di dalam applyFadeOut
    // membaca kurva lama — regenerate tanpa menunggu adalah race atas
    // vector kurva. Tunggu itu selesai dulu (maks 100 ms, tipikal
    // <1 callback).
    waitForRenderIdle();
    {
        uint32_t fadeRate = streamSampleRate();
        if (fadeRate == 0) fadeRate = currentFileSampleRate();
        if (fadeRate == 0) fadeRate = 48000;
        const uint32_t fadeFrames = fadeRate * kPauseFadeMs / 1000;
        pauseFade_.generateCurve(FadeCurve::SCurve, fadeFrames);
        pauseFadeTotalFrames_.store(fadeFrames, std::memory_order_release);
        pauseFadeRemainingFrames_.store(fadeFrames,
                                        std::memory_order_release);
    }

    // 🔥 FIX (2026-11-10, P-M4): pakai snapshot, bukan baca member mentah.
    // pause() boleh block di decodeMutex_ sampai chunk selesai (p-m22), jadi
    // dipanggil DI LUAR decoderMutex_ supaya render() tidak ikut ter-block.
    // Decoder di-pause SEKARANG (bukan sesudah fade): queue menahan audio
    // ter-buffer untuk resume, dan tidak ada audio baru yang masuk selama
    // 15 ms fade — yang di-fade hanya sisa queue yang memang akan
    // terdengar.
    if (auto worker = snapshotWorker()) {
        worker->pause();
    }

    return true;
}

bool PlaybackController::stop() {
    playing_.store(false, std::memory_order_release);
    // PB6-W4: stop membatalkan fade-out pause yang sedang berjalan
    // (render melihat 0 lewat CAS dan berhenti; queue di-clear di bawah).
    pauseFadeRemainingFrames_.store(0, std::memory_order_release);

    // 🔥 FIX (2026-11-10, P-M3): batalkan + tunggu advance selesai.
    // Sebelumnya stop() tidak menyentuh advanceThread_ sama sekali: EOF
    // yang datang sesaat sebelum stop membuat loadTrack tetap jalan di
    // thread itu dan menghidupkan lagi audio setelah stop (render tanpa
    // gate playing, P-M2). Cancel dulu supaya drain-wait bubar (bisa
    // ~20 dtk kalau user pause di tengah ekor).
    //
    // PB6-W3: TIDAK ADA lagi join di sini — worker advance permanen, dan
    // stop() hanya menunggu worker idle (waitForAdvanceIdle), bukan
    // me-join thread-nya. Satu-satunya join worker ada di shutdown().
    // stop() hanya dipanggil JNI nativeStop (thread JS) — tidak pernah
    // dari thread decoder — jadi menunggu worker di sini tidak bisa
    // deadlock dengan stopDecoder worker (yang men-join thread decoder):
    // thread decoder tidak pernah menunggu stop().
    cancelPendingAdvance();
    waitForAdvanceIdle();

    // 🔥 FIX (2026-11-12, PB2-M1): lock loadTrackMutex_ HANYA SETELAH
    // advance selesai (waitForAdvanceIdle di atas). JANGAN pindahkan lock
    // ini ke awal fungsi: stop() yang memegang mutex lalu menunggu worker
    // advance akan deadlock — worker yang sedang loadTrack() tidak bisa
    // selesai karena menunggu mutex yang sama, sementara stop() menunggu
    // worker selesai. Urutan tunggu-dulu-baru-lock adalah bagian dari
    // fix, bukan gaya penulisan. (PB6-W3: "join" lama diganti
    // waitForAdvanceIdle — worker permanen, bukan thread sekali pakai —
    // tapi aturan urutannya sama.)
    std::lock_guard<std::recursive_mutex> lock(loadTrackMutex_);

    stopDecoder();

    // 🔥 FIX (2026-11-12, B8-P2): naikkan epoch generasi — decoder lama
    // sudah mati (stopDecoder men-join thread-nya), jadi post EOF yang
    // telat darinya harus ditolak scheduleAdvance; tanpa bump, post
    // telat itu lolos cek URI (currentTrack_ tidak berubah di stop)
    // dan membersihkan advanceCancelled_ yang baru dinaikkan di atas.
    // play() berikutnya memuat track baru lewat loadTrack() (bump
    // lagi), jadi tidak ada post sah yang kehilangan generasinya.
    loadGen_.fetch_add(1, std::memory_order_release);

    // 🔥 FIX (2026-11-10, p-m12): kibarkan clearing_ + tunggu in-flight
    // render selesai sebelum clear — stop() sebelumnya tidak memakai
    // clearing_ sama sekali.
    clearing_.store(true, std::memory_order_seq_cst);
    waitForRenderIdle();
    pcmQueue_->clear();
    clock_->reset();
    // 🔥 FIX (2026-11-10, P-M9): buang sisa WSOLA. Di dalam jendela
    // clearing_ (pola yang sama dengan loadTrack/seek).
    rateProcessor_.reset();
    pitchShifter_.reset();  // Fase R: buang sisa pitch shifter juga
    clearing_.store(false, std::memory_order_release);

    // 🔥 FIX (2026-11-10, p-m23): reset laju file supaya tidak basi
    // ke siklus start berikutnya (pola sama dengan m5 audit manager+core).
    // PB6-MINOR(f) (2026-11-12): streamSampleRate_ TIDAK di-reset di sini
    // — render() mengisi ulang dari laju stream tiap callback
    // (setStreamSampleRate), jadi store(0) tak berdampak; semua pembaca
    // di antara stop() dan render() berikutnya punya fallback (laju file /
    // track / 48000), dan nilai lama adalah laju stream yang benar
    // (stream belum di-reopen). fileSampleRate_ tetap di-reset: itu
    // metadata file lama, bukan laju stream.
    fileSampleRate_.store(0, std::memory_order_release);

    // Tidak ada lagi track yang "sudah selesai" setelah stop (P-M7).
    decoderFinished_.store(false, std::memory_order_release);
    framesSinceLoad_.store(0, std::memory_order_release);

    // 🔥 FIX (2026-11-10, p-m4): stop = Stopped, bukan Paused.
    // updatePlaybackState() hanya tahu Playing/Paused (dari playing_), jadi
    // status di-set eksplisit di sini dan updatePlaybackState() TIDAK
    // dipanggil — kalau dipanggil, Stopped langsung tertimpa Paused lagi.
    if (state_) state_->setStatus(PlaybackStatus::Stopped);

    return true;
}

bool PlaybackController::seek(double seconds) {
    // B8-P1 (2026-11-12): batalkan advance DULU (sebelum lock) — pola
    // yang sama dengan next()/previous(): EOF yang datang sesaat sebelum
    // seek bisa menjadwalkan advance (drain-wait lalu loadTrack track
    // berikutnya) sementara user minta tetap di track ini dari posisi
    // baru. cancelPendingAdvance() mengambil loadTrackMutex_ sebentar
    // (PB6-W3); dipanggil sebelum lock_guard di bawah supaya tidak
    // menahan mutex sambil menunggu load yang sedang berjalan —
    // redundan-namun-aman, bukan lubang (ia block di belakang load yang
    // sama seperti seek sendiri).
    cancelPendingAdvance();
    // 🔥 FIX (2026-11-12, PB2-M1): serialisasi terhadap loadTrack().
    // seek() menyentuh decoder/PCMQueue/clock yang sama dengan loadTrack()
    // — tanpa lock, seek dari thread JS bisa jalan bersamaan dengan
    // loadTrack() dari advance thread (atau sebaliknya). Edge baru
    // loadTrackMutex_ -> decodeMutex_ (lewat worker->pause/seek/resume)
    // searah dengan yang sudah ada di loadTrack (stopDecoder -> worker->
    // stop()); tidak ada jalur balik. Tidak ada nesting di bawah
    // loadTrackMutex_ di sini: dipanggil dari reopenStreamPreservingPlayback()
    // (yang memegang mMutex, bukan loadTrackMutex_) dan dari JNI. Dulu
    // reopen bisa berjalan di dalam loadTrack lewat listener — jalur itu
    // ditutup PB6-B1.
    std::lock_guard<std::recursive_mutex> lock(loadTrackMutex_);

    // 🔥 FIX (2026-11-10, p-m13): seek SELAMA INI tanpa satu pun log —
    // tidak terlihat di logcat, padahal play/pause/stop/loadTrack semua log.
    __android_log_print(ANDROID_LOG_INFO, "PlaybackController",
                        "seek(): target=%.3fs", seconds);

    // B8-P1: bersihkan guard flood EOF — seek ke detik-detik akhir lagu
    // lalu EOF kedua <500 ms sesudah seek bisa tertelan guard
    // (lastEofUri_ masih URI yang sama + lastEofTime_ masih segar),
    // padahal EOF kedua itu sah (posisi baru memang dekat akhir).
    // Di bawah eofMutex_, sama seperti callback EOF.
    {
        std::lock_guard<std::mutex> eofLock(eofMutex_);
        lastEofUri_.clear();
    }

    // 🔥 FIX (2026-11-10, P-M4): pakai snapshot. Dulu cek-lalu-pakai
    // decoderWorker_ tanpa lock; kalau stopDecoder() memindahkan pointer di
    // antara cek (:306) dan pause()/seek() (:315/:335) → deref null. Salinan
    // shared_ptr menjaga objek hidup walau member sudah diganti; seek pada
    // worker lama yang sudah di-stop mengembalikan false dengan bersih
    // (decoder sudah close) alih-alih crash.
    auto worker = snapshotWorker();
    if (!worker) {
        __android_log_print(ANDROID_LOG_WARN, "PlaybackController",
                            "seek(): FAILED - no decoder");
        return false;
    }

    // PB6-W4: batalkan fade-out pause yang sedang berjalan. Kalau fade
    // sedang berjalan, user sudah menekan pause — playing_ masih true
    // selama fade, dan kalau dibiarkan true melewati seek, audio
    // langsung berbunyi lagi dari titik baru padahal user minta pause.
    // Jadi niat pause dipertahankan (playing_ dimatikan di sini; seek
    // yang gagal di bawah memanggil worker->resume() tapi render tetap
    // senyap karena playing_ false). Ditempatkan SETELAH cek worker
    // null di atas: seek yang gagal total (tanpa decoder) tidak boleh
    // membatalkan fade — fade itu yang mematikan playing_.
    const bool wasPausing =
        pauseFadeRemainingFrames_.load(std::memory_order_acquire) > 0;
    pauseFadeRemainingFrames_.store(0, std::memory_order_release);
    if (wasPausing) {
        playing_.store(false, std::memory_order_release);
        updatePlaybackState();
    }

    // 🩹 FIX (Prioritas 2): PCMQueue adalah SPSC lock-free ring buffer
    // — HANYA aman diakses oleh 1 producer (decoder thread) + 1
    // consumer (audio callback thread). clear() dari thread ketiga
    // (JNI/seek caller) bisa menyebabkan writeIndex_/readIndex_ desync
    // kalau kebetulan race dengan decoder thread yang masih write().
    // Fix: pause producer dulu supaya tidak ada writer aktif saat clear.
    worker->pause();

    // 🔥 FIX (2026-11-10, p-m12): kibarkan clearing_ + tunggu in-flight
    // render selesai sebelum clear — seek() sebelumnya tidak memakai
    // clearing_ sama sekali, jadi render yang sedang berjalan bisa copy
    // slot basi selama 1 callback.
    clearing_.store(true, std::memory_order_seq_cst);
    waitForRenderIdle();
    pcmQueue_->clear();
    // 🔥 FIX (2026-11-10, P-M9): buang sisa WSOLA posisi lama. HARUS di
    // dalam jendela clearing_ (sebelum store false di bawah) — render()
    // tidak sedang push/pull di sini.
    rateProcessor_.reset();
    pitchShifter_.reset();  // Fase R: buang sisa pitch shifter juga
    clearing_.store(false, std::memory_order_release);

    // 🔥 FIX (2026-11-10, p-m10): seek decoder DULU, clock HANYA kalau
    // berhasil. Sebelumnya clock digeser dulu (:333) baru decoder di-seek
    // (:335) — kalau decoder seek gagal, clock sudah pindah tapi audio
    // lanjut dari posisi lama → offset posisi persisten sampai loadTrack
    // berikutnya. Posisi clock diambil dari posisi AKTUAL decoder setelah
    // seek (bisa mundur ke keyframe — lihat FFmpegDecoder::onSeek), bukan
    // dari target yang diminta.
    bool ok = worker->seek(seconds);
    if (!ok) {
        __android_log_print(ANDROID_LOG_WARN, "PlaybackController",
                            "seek(): FAILED - decoder seek returned false, "
                            "clock tidak digeser");
        worker->resume();
        return false;
    }

    // 🩹 FIX (2026-10-07): laju clock HARUS laju stream aktual, bukan 48000
    // tetap. Decoder meresample PCM ke laju stream (lihat startDecoder:
    // cfg.targetSampleRate = streamSampleRate()), jadi domain frame clock =
    // laju stream. Hardcode 48000 membuat seek meleset di file non-48k:
    // file 44.1kHz yang di-seek ke 90s disimpan sebagai 90*48000 = 4.32M frame,
    // lalu dirender pada 44100 → UI melapor ~98s.
    //
    // streamSampleRate() masih 0 sebelum render() pertama (stream belum buka).
    // Dalam kasus itu fallback 48000 = perilaku lama, supaya seek tidak
    // menghasilkan frame 0 (meleset ke awal track).
    uint32_t seekRate = streamSampleRate();
    if (seekRate == 0) {
        seekRate = 48000;
    }
    const double actualSeconds = worker->getPosition();
    clock_->seekToSeconds(
        actualSeconds > 0.0 ? actualSeconds : seconds, seekRate);

    // 🔥 FIX (2026-11-11, DV-M1): state ikut digeser SEKARANG, bukan nunggu
    // render() berikutnya. reopenStreamPreservingPlayback() membaca posisi
    // dari state, bukan clock; loadTrack me-reset state ke 0 dan seek hanya
    // menggeser clock — reopen kedua yang datang sebelum satu callback
    // render membaca 0 dan track mulai dari awal (logcat #12, 12:30:40).
    // Store atomik, aman terhadap write render() (nilai yang sama sumbernya).
    if (state_) {
        const double posSeconds = actualSeconds > 0.0 ? actualSeconds : seconds;
        state_->setPosition(static_cast<uint64_t>(posSeconds * 1000.0));
    }

    // 🔥 FIX (2026-11-10, P-M7): seek = awal baru — fade-in singkat supaya
    // tidak klik di titik seek, dan decoder belum selesai (baru di-seek).
    framesSinceLoad_.store(0, std::memory_order_release);
    decoderFinished_.store(false, std::memory_order_release);

    worker->resume();

    __android_log_print(ANDROID_LOG_INFO, "PlaybackController",
                        "seek(): OK target=%.3fs actual=%.3fs",
                        seconds, actualSeconds);
    return true;
}

// =====================================================
// AUDIO RENDER (REALTIME CRITICAL)
// =====================================================

// RAII: menandai render() sedang berjalan (p-m12, 2026-11-10). Counter
// renderActive_ dibaca waitForRenderIdle() dari loadTrack/stop/seek.
// noexcept: fetch_add/fetch_sub tidak pernah throw.
//
// PB6-B2 (2026-11-12): keempat operasi clearing_/renderActive_ memakai
// seq_cst (guard ini, load clearing_ di render(), store clearing_ di
// loadTrack/stop/seek, load renderActive_ di waitForRenderIdle) — pola
// Dekker: release/acquire tidak mengurutkan store→load antar thread, di
// ARM64 kedua sisi bisa sama-sama membaca nilai lama sehingga clear() /
// reset prosesor jalan bersamaan dengan render() yang sedang membaca queue.
// fetch_sub ikut seq_cst demi keseragaman dengan fetch_add.
struct RenderActiveGuard {
    explicit RenderActiveGuard(std::atomic<int>& counter) noexcept
        : counter_(counter) {
        counter_.fetch_add(1, std::memory_order_seq_cst);
    }
    ~RenderActiveGuard() {
        counter_.fetch_sub(1, std::memory_order_seq_cst);
    }
    RenderActiveGuard(const RenderActiveGuard&) = delete;
    RenderActiveGuard& operator=(const RenderActiveGuard&) = delete;
    std::atomic<int>& counter_;
};

size_t PlaybackController::render(float* output,
                                uint32_t frames,
                                uint32_t channels,
                                uint32_t sampleRate) noexcept {
    if (!output || frames == 0) return 0;

    // Hitung render yang sedang berjalan — semua return di bawah melewati
    // destruktor guard ini.
    const RenderActiveGuard renderGuard(renderActive_);

    // Laju stream datang dari pemilik stream (AudioEngine). Disimpan supaya
    // startDecoder() bisa memakai laju yang BENAR sebagai target resample,
    // bukan default 48000.
    if (sampleRate >= 8000 && sampleRate <= 768000) {
        setStreamSampleRate(sampleRate);
    }

    const size_t requestedSamples =
        static_cast<size_t>(frames) * channels;

    // 🔥 RACE FIX
    if (clearing_.load(std::memory_order_seq_cst)) {
        std::fill(output, output + requestedSamples, 0.0f);
        // 🔥 FIX (2026-11-10, p-m14): laporkan buffer penuh (requestedSamples),
        // bukan 0. Buffer MEMANG terisi (dengan senyap) — AudioCallback
        // mencatat underrun kalau return < requested, jadi tiap ganti track
        // dulu menambah counter underrun padahal queue memang sengaja
        // dikosongkan.
        return requestedSamples;
    }

    // 🔥 FIX (2026-11-10, P-M2): JANGAN drain queue saat paused/stopped.
    //
    // Sebelumnya render() membaca queue tanpa cek playing_ — pause() hanya
    // menghentikan producer (decoder), queue 60–90% penuh (~26–39 dtk @48k)
    // tetap mengalir ke speaker. Audio terus jalan belasan detik setelah
    // pause ditekan.
    //
    // Sekarang: isi buffer dengan senyap dan laporkan penuh (p-m14 — buffer
    // memang terisi, jadi bukan underrun). Clock sudah di-gate playing_
    // sejak 2026-10-10, jadi posisi berhenti; decoder juga tidak di-resume
    // saat paused (cek di bawah).
    // PB6-W4: fade-out pause yang sedang berjalan (remaining_ > 0) harus
    // tetap melewati jalur audio normal — kalau cabang senyap di bawah
    // diambil, fade tidak pernah berbunyi. playing_ sengaja masih true
    // selama fade (pause() tidak mematikannya), jadi kondisi ini hanya
    // menutup celah kalau playing_ sempat dimatikan thread lain
    // (mis. processAdvance kehabisan queue) di tengah fade.
    const bool pausing =
        pauseFadeRemainingFrames_.load(std::memory_order_acquire) > 0;
    if (!playing_.load(std::memory_order_acquire) && !pausing) {
        std::fill(output, output + requestedSamples, 0.0f);
        return requestedSamples;
    }

    // 🔥 FIX (2026-11-10, P-M9): laju playback (WSOLA time-stretch).
    //
    // Rate 1.0 = bypass (nol overhead, jalur bit-perfect tidak tersentuh).
    // Rate != 1.0: baca frames * rate dari queue (input), dorong ke
    // prosesor, tarik `frames` output. Clock maju mengikuti frame INPUT
    // (posisi track), bukan frame output — di 2x, posisi maju 2x lipat
    // per detik wall-clock.
    //
    // Perubahan laju diterapkan DI SINI (audio thread), bukan di
    // setPlaybackRate (thread JS): reset buffer WSOLA harus terjadi di
    // thread yang sama dengan push/pull, kalau tidak vector di-clear
    // sementara render() sedang membacanya.
    //
    // PB6-W1 (2026-11-12): gate bit-perfect — laju efektif 1.0 saat
    // processing tidak diizinkan, walau playbackRate_ bukan 1.0 (target
    // tersimpan tetap utuh, jadi keluar dari bit-perfect langsung
    // mengembalikan laju tanpa set ulang — pola yang sama dengan pitch).
    // processingAllowed_ dibaca sekali di sini dan dipakai ulang untuk
    // gerbang pitch di bawah; `rate` di bawah ini adalah laju EFEKTIF,
    // jadi log render dan applyTrackFades() juga memakai nilai yang
    // benar-benar didengar.
    const bool processingAllowed =
        processingAllowed_.load(std::memory_order_acquire);
    const float rate = processingAllowed
        ? playbackRate_.load(std::memory_order_acquire)
        : 1.0f;
    if (rate != rateApplied_) {
        rateProcessor_.setRate(rate);  // reset buffer bila laju berubah
        rateApplied_ = rate;
    }
    const bool useRate = (rate != 1.0f);
    const size_t inputFrames =
        useRate ? static_cast<size_t>(static_cast<float>(frames) * rate +
                                      0.5f)
                : frames;
    const size_t inputSamples = inputFrames * channels;
    size_t readSamples = 0;    // input: sample yang dibaca dari queue
    size_t outputSamples = 0;  // output: sample yang benar-benar dihasilkan
    if (useRate) {
        // PB6-W2B (2026-11-12): JANGAN resize di audio thread — render()
        // noexcept, bad_alloc = terminate. Kapasitas pre-alokasi (16448)
        // menutup envelope 4096 frame callback Oboe penuh × laju 2.0 ×
        // stereo — 4096 BUKAN kMax 1920: render() dipanggil dengan
        // numFrames penuh sebelum chunking pipeline, dan burst 3840
        // frame @192 kHz (20 ms) muat di dalamnya; di luar itu callback
        // ini dibisukan — pola yang sama dengan clearing_/paused di
        // atas (p-m14: laporkan buffer penuh).
        if (inputSamples > rateScratch_.size()) {
            std::fill(output, output + requestedSamples, 0.0f);
            return requestedSamples;
        }
        readSamples = pcmQueue_->read(rateScratch_.data(), inputSamples);
        rateProcessor_.push(rateScratch_.data(), readSamples / channels,
                            channels);
        outputSamples =
            rateProcessor_.pull(output, frames, channels) * channels;
    } else {
        readSamples = pcmQueue_->read(output, requestedSamples);
        outputSamples = readSamples;
    }

    // 🔥 FASE R (2026-11-11): retune (phase vocoder pitch shift).
    //
    // Pitch dulu, baru tempo (WSOLA di atas sudah jalan duluan — urutan
    // rantai: pitch -> tempo; keduanya kontrol ortogonal yang independen).
    // Rasio 1.0 = bypass (nol overhead, jalur bit-perfect tidak tersentuh).
    // Frame masuk = frame keluar (frame-count preserving) — clock maju
    // mengikuti frame INPUT (readSamples, di bawah), jadi tidak ada yang
    // perlu diubah di clock. Gate bit-perfect: rasio efektif 1.0 saat
    // processingAllowed_ false (diset EngineManager::setProcessingMode) —
    // flag yang sama dengan gerbang laju di atas (PB6-W1: nama lama flag
    // ini hanya menyebut pitch, padahal kini mencakup rate+fade).
    // Perubahan rasio diterapkan DI SINI (audio thread), bukan di
    // setPitchRatio (thread JS): reset buffer pitch shifter harus terjadi
    // di thread yang sama dengan push/pull.
    const float pitchTarget = pitchRatio_.load(std::memory_order_acquire);
    const float pitchRatio = processingAllowed ? pitchTarget : 1.0f;
    if (pitchRatio != pitchApplied_) {
        pitchShifter_.setRatio(pitchRatio);  // reset buffer bila berubah
        pitchApplied_ = pitchRatio;
    }
    if (pitchRatio != 1.0f) {
        // push() menyalin dulu ke buffer internal, jadi pull() ke buffer
        // `output` yang sama aman. Shortfall (latensi awal ~1,5 jendela)
        // diisi senyap oleh blok zero-fill di bawah (outputSamples =
        // hasil pull, bukan requested).
        pitchShifter_.push(output, outputSamples / channels, channels);
        outputSamples =
            pitchShifter_.pull(output, frames, channels) * channels;
    }

    // PB6-W2A (2026-11-12): audio thread TIDAK LAGI me-resume decoder.
    //
    // Dulu blok di sini memanggil snapshotWorker() + worker->resume()
    // tiap callback saat queue < 60% — lock decoderMutex_ + notify di
    // jalur realtime. Sekarang decoder yang backpressure-paused
    // (queue > 90%, lihat decode callback di startDecoder) bangun
    // sendiri tiap 10 ms dan menanyakan predikat auto-resume
    // (setAutoResumeCheck di startDecoder: queue < 60% + playing_ +
    // bukan fade-out pause). Dua gerbang itu — playing_ (bug
    // 2026-10-10: resume saat pause menghidupkan lagi audio) dan
    // fade-out pause (PB6-W4) — pindah bersama predikatnya, bukan
    // hilang. Jeda eksplisit (user pause / seek) memakai flag terpisah
    // di worker dan TIDAK PERNAH di-resume predikat ini.
    //
    // Riwayat threshold (dipertahankan): resume di 60% sejak
    // 2026-10-06 (30% terlalu lama untuk file hi-res yang butuh 2x
    // throughput — queue hampir kosong sebelum decoder bangun).
    // snapshotWorker() di render() masih ada di bawah, tapi HANYA di
    // cabang self-heal durasi (P-M8, sekali sampai durasi terisi),
    // bukan per callback.

    // 🔥 SAFETY NET: cleanup NaN/Inf di render (untuk sisa race boundary).
    // Berjalan atas OUTPUT (setelah WSOLA) — input kotor dari decoder juga
    // tertangkap di sini karena WSOLA meneruskannya ke output.
    {
        int nanCount = 0;
        for (size_t i = 0; i < outputSamples; ++i) {
            const float v = output[i];
            if (std::isnan(v) || std::isinf(v)) {
                output[i] = 0.0f;
                nanCount++;
            }
            // 🔥 FIX (2026-10-06, "96kHz masih cacat"): guard magnitudo.
            //
            // swr_convert output selalu di [-1, 1]. Nilai 1e18-1e32 (bit pattern
            // malloc garbage) adalah float VALID — lolos dari isnan/isinf dan
            // langsung ke DAC → glitch sangat keras ("cacat"). 13.733 sample
            // seperti ini ditemukan eksklusif di trek FLAC 96kHz (0 di trek
            // 48kHz). Threshold 2.0 membiarkan sinyal nyata (bahkan clip) tapi
            // membuang garbage jelas.
            else if (v > 2.0f || v < -2.0f) {
                output[i] = 0.0f;
                nanCount++;
            }
        }
        // PB6-W2C (2026-11-12): HANYA hitung — JANGAN log di sini.
        // __android_log_print per callback yang mengandung NaN = sampai
        // 100 log/dtk @480 frame (25/dtk @1920) di audio thread.
        // Total dibaca + dilog dari thread polling JNI
        // (NativePlaybackModule::nativeGetPosition, tiap 500 ms, hanya
        // bila total bertambah sejak poll terakhir).
        if (nanCount > 0) {
            mNanTotal_.fetch_add(static_cast<uint32_t>(nanCount),
                                 std::memory_order_relaxed);
        }
    }

    // 🔥 SPAM CONTROL: log hanya tiap 5000 render
    static int renderCount = 0;
    renderCount++;
    if (renderCount % 5000 == 0) {
        __android_log_print(ANDROID_LOG_INFO, "PlaybackController",
                            "render readSamples=%zu outputSamples=%zu/%zu (frames=%u ch=%u rate=%.2f)",
                            readSamples, outputSamples, requestedSamples, frames, channels, rate);
    }
    // (Blok debug min/max/mean per 100 callback dihapus 2026-11-10 (M5):
    // satu pass penuh atas buffer + log di audio thread — debug yang
    // ketinggalan, bukan metrik.)
    if (outputSamples < requestedSamples) {
        std::fill(
            output + outputSamples,
            output + requestedSamples,
            0.0f
        );
    }

    // 🔥 FIX (2026-11-10, P-M7): fade-in awal track + fade-out ekor.
    // Dipanggil SEBELUM clock maju, supaya offset fade-in memakai
    // framesSinceLoad_ SEBELUM callback ini.
    applyTrackFades(output, frames, channels, readSamples, rate);

    // PB6-W4: fade-out pause (15 ms, S-curve — lihat pause()).
    //
    // Dijalankan di SINI, setelah applyTrackFades + zero-fill: gain
    // diterapkan ke seluruh buffer callback ini (termasuk ekor yang
    // di-zero-fill — gain atas 0 tetap 0). Kemajuan dihitung dalam
    // frame OUTPUT callback (bukan sampel terbaca): fade selesai tepat
    // waktu walau queue kosong/underrun saat pause ditekan. Kalau
    // frames callback melebihi sisa fade, applyFadeOut meng-clamp gain
    // di frame terakhir kurva (0.0) untuk ekor buffer — senyap bersih.
    //
    // Klaim kemajuan pakai CAS, BUKAN load-lalu-store: play()/stop()/
    // seek()/loadTrack() membatalkan fade dengan store(0); load-lalu-
    // store render bisa menimpa 0 itu dengan sisa basi dan mempersenjatai
    // ulang fade SESUDAH resume — resume lalu dibungkam lagi setelah
    // satu callback. CAS yang gagal memuat ulang nilai baru: kalau 0,
    // fade sudah dibatalkan dan blok ini dilewati tanpa menulis apa pun.
    // Kurva dibaca SETELAH CAS berhasil — pause() tidak pernah menulis
    // ulang kurva selama remaining_ > 0, jadi total_ stabil di sini.
    //
    // B8-M6 (2026-11-12): callback yang MENYELESAIKAN fade menyimpan
    // playing_=false di bawah, sebelum blok clock di bawah membaca
    // playing_ — jadi frame yang baru saja di-render callback ini
    // berkontribusi 0 ke clock dan posisi berhenti 1 callback lebih
    // cepat. Tangkap penyelesaian fade di flag lokal supaya blok clock
    // tetap memajukan frame callback ini (sekali saja, lihat penalaran
    // anti-double-count di blok clock).
    bool fadeFinishedThisCallback = false;
    {
        uint32_t remaining =
            pauseFadeRemainingFrames_.load(std::memory_order_acquire);
        while (remaining > 0) {
            const uint32_t step = std::min(frames, remaining);
            const uint32_t next = remaining - step;
            if (pauseFadeRemainingFrames_.compare_exchange_weak(
                    remaining, next, std::memory_order_acq_rel,
                    std::memory_order_acquire)) {
                const uint32_t total =
                    pauseFadeTotalFrames_.load(std::memory_order_acquire);
                const uint32_t offset =
                    (total > remaining) ? total - remaining : 0;
                pauseFade_.applyFadeOut(output, frames, channels, offset);
                if (next == 0) {
                    // Fade habis: baru sekarang benar-benar pause.
                    // Satu-satunya penulis playing_=false di jalur ini —
                    // pause() sengaja tidak mematikannya.
                    fadeFinishedThisCallback = true;
                    playing_.store(false, std::memory_order_release);
                    updatePlaybackState();
                }
                break;
            }
            // CAS gagal: remaining dimuat ulang (0 = dibatalkan) —
            // loop mengulang atau keluar.
        }
    }

    // 🔥 FIX (2026-10-10): clock hanya boleh maju untuk audio nyata.
    //
    // BUG A (posisi melompat ke 72 menit): advanceFrames(frames) dipanggil
    // di SETIAP callback, termasuk saat PAUSED. Saat paused queue kosong,
    // output diisi silence, tapi clock TETAP bertambah.
    //   log: [DIAG] PAUSED pos=4343488ms speed=0.77x
    //   72.39 menit × 48000 = 208.483.200 frames = 4.343.488 ms  ← persis
    //
    // BUG B (speed 2.00x konstan): PCMQueue menghitung SAMPLE, bukan FRAME.
    //   log: render readSamples=1664 (frames=832 ch=2)
    // Stereo → clock maju 2x lipat. Bagi channel dulu.
    //
    // BUG C (2026-10-10, "position merangkak saat paused"): clock maju
    // untuk sampel YANG MASIH ADA DI QUEUE saat user menekan pause.
    // DecoderWorker::pause() menghentikan pengisian, tapi PCMQueue masih
    // menyisa ~1-2 detik audio ter-buffer. render() terus memanggil read()
    // (mengosongkan queue ke speaker = benar, drain itu yang diinginkan)
    // dan clock ikut maju untuk audio itu — padahal user sudah pause.
    //   log: pause() @ 02:08:29 → MediaSession posisi 4136 → 5160 → 6168
    //   Tapi DIAG melaporkan PAUSED pos=5896ms (posisi benar setelah drain).
    //
    // Jadi: saat paused, audio memang boleh drain (lebih baik diam),
    // tapi clock harus berhenti. Posisi yang dilaporkan kembali ke posisi
    // saat pause ditekan, bukan posisi setelah buffer habis.
    // B8-M6 (2026-11-12): callback yang menyelesaikan fade-out pause
    // (fadeFinishedThisCallback) SUDAH menyimpan playing_=false sebelum
    // sampai ke sini, tapi frame callback ini nyata di-render (dan
    // terdengar, ter-fade) — jadi clock tetap maju untuk frame itu.
    // Penalaran anti-double-count: flag ini hanya true di callback yang
    // CAS-nya menyelesaikan fade (next == 0); callback BERIKUTNYA
    // membaca remaining == 0, blok fade dilewati, flag false, dan
    // playing_ sudah false — jadi frame yang sama tidak pernah dihitung
    // dua kali. Akurasi posisi: advancedFrames dihitung dari readSamples
    // (frame INPUT yang benar-benar dibaca dari queue dan di-render),
    // ukuran yang sama dengan callback normal — tidak ada lompatan
    // melewati durasi; advanceFrames sendiri hanya fetch_add tanpa
    // clamp, sama seperti semua callback lain. Jalur normal (tanpa
    // fade) tidak berubah: flag false, kondisi identik dengan semula.
    const uint32_t ch = (channels > 0) ? channels : 1;
    // Frame INPUT (posisi track): di 2x, satu callback 20 ms membaca 40 ms
    // audio — clock maju 40 ms. Bukan frame output (itu selalu 20 ms).
    const uint32_t advancedFrames = static_cast<uint32_t>(readSamples) / ch;
    if (advancedFrames > 0 &&
        (playing_.load(std::memory_order_acquire) ||
         fadeFinishedThisCallback)) {
        clock_->advanceFrames(advancedFrames);
    }
    // Hitung untuk fade-in (P-M7): frame OUTPUT sejak loadTrack/seek/play
    // (bukan frame input — di 2x, 300 ms output = 600 ms input; durasi
    // fade adalah durasi yang didengar, jadi hitung output).
    if (playing_.load(std::memory_order_acquire)) {
        framesSinceLoad_.fetch_add(frames, std::memory_order_relaxed);
    }

    // 🔥 FIX: sync position & duration ke state (untuk JS getPosition)
    if (state_ && clock_ && sampleRate > 0) {
        // Pasangan konsisten (p-m17): posisi + durasi dari generasi yang sama.
        const auto [framesPos, framesDur] =
            clock_->snapshotPositionAndDuration();
        uint64_t msPos = (framesPos * 1000ULL) / sampleRate;
        state_->setPosition(msPos);

        if (framesDur > 0) {
            uint64_t msDur = (framesDur * 1000ULL) / sampleRate;
            state_->setDuration(msDur);
        } else {
            // Self-heal (P-M8/p-m11): kalau duration clock masih 0 (mis.
            // loadTrack tidak tahu durasi karena metadata 0 dan decoder
            // belum selesai open), isi dari durasi decoder sekarang juga.
            // Setelah terisi, callback berikutnya memakai cabang di atas —
            // fallback ini tidak lagi jalan tiap callback. Saat decoder
            // membuka file hi-res, track duration dari MediaMetadataRetriever
            // bisa 0 → UI durasi 0:00; durasi decoder menutup lubang itu.
            //
            // B8-P4 (2026-11-12): THROTTLE — untuk file TANPA durasi
            // (VBR/stream tanpa durasi), cabang ini tadinya memanggil
            // snapshotWorker() + worker->getDuration() di SETIAP callback
            // (lock decoderMutex_ singkat + baca formatCtx_ tiap ~20 ms,
            // selamanya). Sekarang heal dicoba segera di callback pertama
            // (counter 0 — file DENGAN durasi tetap terisi secepat
            // sebelumnya), lalu paling sering tiap ~128 callback selama
            // durasi masih 0. Begitu durasi terisi, cabang ini berhenti
            // dan counter membeku; loadTrack() me-reset counter ke 0.
            const uint32_t healCount = durationHealCounter_.fetch_add(
                1, std::memory_order_relaxed);
            if (healCount == 0 ||
                healCount % kDurationHealIntervalCallbacks == 0) {
                if (auto worker = snapshotWorker()) {
                    const double decDur = worker->getDuration();
                    if (decDur > 0.0) {
                        clock_->setDurationFrames(
                            static_cast<uint64_t>(decDur * sampleRate));
                        state_->setDuration(
                            static_cast<uint64_t>(decDur * 1000.0));
                    }
                }
            }
        }
    }

    // Jumlah sample OUTPUT yang benar-benar dihasilkan — AudioCallback
    // memakainya untuk metrik underrun (M5, 2026-11-10). Sisa buffer (kalau
    // ada) sudah diisi senyap di atas. Saat rate != 1.0, angka ini adalah
    // hasil pull WSOLA (bukan yang dibaca dari queue — queue dibaca
    // frames * rate).
    return outputSamples;
}

// =====================================================
// DECODER CONTROL
// =====================================================

void PlaybackController::setMetrics(pristine::AudioMetrics* metrics) noexcept {
    metricsEngine_ = metrics;
}

void PlaybackController::setTrackLoadedListener(std::function<void()> listener) {
    trackLoadedListener_ = std::move(listener);
}

size_t PlaybackController::bufferedSamples() const noexcept {
    if (!pcmQueue_) return 0;
    return pcmQueue_->availableSamples();
}

// PB6-MINOR(b) (2026-11-12): lihat deklarasi di header.
bool PlaybackController::isDecoderFinished() const noexcept {
    return decoderFinished_.load(std::memory_order_acquire);
}

// PB6-W2C (2026-11-12): dibaca thread polling JNI (nativeGetPosition)
// untuk log throttle; hanya atomic load, tanpa lock.
uint32_t PlaybackController::nanCleanedTotal() const noexcept {
    return mNanTotal_.load(std::memory_order_relaxed);
}

void PlaybackController::setStreamSampleRate(uint32_t rate) noexcept {
    if (rate >= 8000 && rate <= 768000) {
        const uint32_t prev = streamSampleRate_.exchange(rate, std::memory_order_acq_rel);
        if (prev != rate) {
            __android_log_print(ANDROID_LOG_INFO, "PlaybackController",
                "setStreamSampleRate: %u -> %u", prev, rate);
        }
    }
}

uint32_t PlaybackController::streamSampleRate() const noexcept {
    return streamSampleRate_.load(std::memory_order_acquire);
}

void PlaybackController::setFileSampleRate(uint32_t rate) noexcept {
    // Sama seperti setStreamSampleRate: di luar rentang audio wajar berarti
    // metadata tidak terbaca, jangan dipakai sebagai target stream.
    if (rate >= 8000 && rate <= 768000) {
        fileSampleRate_.store(rate, std::memory_order_release);
    } else {
        fileSampleRate_.store(0, std::memory_order_release);
    }
}

uint32_t PlaybackController::currentFileSampleRate() const noexcept {
    return fileSampleRate_.load(std::memory_order_acquire);
}

// 🔥 FIX (2026-11-11, D-M2): muat ulang track saat ini kalau decoder dibuat
// dengan target laju yang berbeda dari laju stream aktual.
//
// Hanya relevan untuk track pertama: startDecoder jalan saat stream masih 0
// dan memakai laju file sebagai target; kalau perangkat ternyata tidak
// mendukung laju file, EngineManager::start() membuka stream di laju lain
// (pickBestRateFor) dan decoder harus dibuat ulang dengan target yang benar.
//
// Dipanggil dari EngineManager::start() (thread JS, setelah stream terbuka)
// — loadTrack aman di sini (bukan audio thread). Track baru saja dimuat
// (posisi ~0), jadi reload dari awal tidak terdengar sebagai lompatan.
//
// Aman terhadap reopen: loadTrack di sini memicu trackLoadedListener →
// onTrackLoaded(); di titik itu stream sudah di laju `wanted`
// (pickBestRateFor) sehingga tidak ada reopen kedua — kecuali engine tidak
// menghormati laju yang diminta, dan saat itu satu permintaan recovery
// (lewat worker, PB6-B1) tetap konvergen ke laju aktual.
bool PlaybackController::reloadIfDecoderRateMismatch(uint32_t actualStreamRate) {
    if (actualStreamRate < 8000 || actualStreamRate > 768000) {
        return false;
    }

    if (!snapshotWorker()) {
        return false;
    }

    const uint32_t target = decoderTargetRate_.load(std::memory_order_acquire);
    if (target == 0 || target == actualStreamRate) {
        return false;
    }

    // Snapshot track di bawah lock singkat (pola P-M4).
    TrackInfo current;
    {
        std::lock_guard<std::recursive_mutex> lock(decoderMutex_);
        current = currentTrack_;
    }
    if (current.uri.empty()) {
        return false;
    }

    __android_log_print(ANDROID_LOG_WARN, "PlaybackController",
        "reloadIfDecoderRateMismatch: decoder target=%u, stream aktual=%u - "
        "memuat ulang track",
        target, actualStreamRate);
    return loadTrack(current);
}

bool PlaybackController::startDecoder(const TrackInfo& track) {
    try {
        // 🔥 FIX (2026-11-10, M3): JANGAN tahan decoderMutex_ melewati
        // start(). Dulu lock dipegang sepanjang fungsi, termasuk
        // worker->start() yang membuka file (FFmpeg I/O) — render() di audio
        // thread ikut ter-block di lock yang sama di tiap ganti track.
        // Sekarang worker dibangun + di-start DI LUAR lock; lock hanya
        // dipakai sebentar saat publikasi pointer di bawah.
        __android_log_print(ANDROID_LOG_INFO, "PlaybackController",
                            "startDecoder(): creating decoder for uri=%s",
                            track.uri.c_str());

        // DecodeConfig.targetSampleRate diisi dari laju STREAM, bukan default.
        //
        // Ini syarat bit-perfect: kalau stream dibuka di 96000 (karena file
        // 96 kHz dan DAC mendukung), decoder TIDAK boleh menurunkan ke 48000.
        // Sebelumnya selalu default 48000, jadi semua file hi-res dikonversi
        // turun tanpa alasan.
        decoder::DecodeConfig cfg;
        // 🔥 FIX (2026-11-11, D-M2): kalau stream belum dibuka (rate == 0,
        // track pertama setelah cold start / stop), pakai laju FILE sebagai
        // target — stream akan dibuka di laju file oleh EngineManager::start().
        // Sebelumnya cfg tetap default 48000, jadi track pertama 96 kHz
        // di-decode ke 48 kHz lalu dimainkan di stream 96 kHz = 2× cepat,
        // dan reopen M1 tidak menyelamatkan (laju file == laju stream).
        // Kalau perangkat ternyata tidak mendukung laju file, stream dibuka
        // di laju lain — reloadIfDecoderRateMismatch() (dipanggil dari
        // EngineManager::start) yang memperbaiki decoder-nya.
        const uint32_t rate = streamSampleRate();
        if (rate >= 8000 && rate <= 768000) {
            cfg.targetSampleRate = rate;
        } else if (track.sampleRate >= 8000 && track.sampleRate <= 768000) {
            cfg.targetSampleRate = track.sampleRate;
        }

        // 🔥 FIX (2026-10-06, "96kHz masih cacat"): chunkFrames dibesarkan
        // untuk file hi-res. decode(maxFrames) berhenti saat OUTPUT mencapai
        // maxFrames, tapi FLAC 96kHz hanya menghasilkan ~1152 output per
        // frame input — decoder harus baca 2x lebih banyak packet untuk
        // jumlah output yang sama. Dengan chunk 4096, throughput loop turun
        // di bawah realtime (11 loop/s x 2238 = 24.8k fps < 48k butuh) →
        // PCMQueue underrun → NaN + garbage 1e32 di render (13.733 sample
        // total, pola 26 tiap 170ms).
        //
        // chunkFrames = 16384 (4x 4096) untuk SEMUA file dengan target rate
        // — cukup untuk downsample sampai 4:1; decoder break sendiri saat
        // output >= maxFrames. (Komentar lama mengklaim chunk diskalakan
        // dengan rasio inRate/outRate dan ada lokal `ratio` — tidak benar:
        // ratio selalu 1 dan tidak pernah dipakai; dihapus 2026-11-10.)
        if (cfg.targetSampleRate > 0) {
            cfg.chunkFrames = 4096 * 4;  // 16384 — cukup untuk 4:1 downsample
        }

        // 🔥 FIX (2026-11-12, B7-W1): satu paket korup tidak boleh skip lagu.
        // Decoder melewati paket korup dan baru gagal sesudah
        // maxConsecutiveErrors (default 3) beruntun; EAGAIN dari send_packet
        // bukan error (decoder penuh — drain dulu). Lihat FFmpegDecoder::onDecode.
        cfg.continueOnError = true;
        __android_log_print(ANDROID_LOG_INFO, "PlaybackController",
            "startDecoder: targetSampleRate=%u (stream=%u file=%u) chunkFrames=%u",
            cfg.targetSampleRate, rate, track.sampleRate, cfg.chunkFrames);

        // 🔥 FIX (2026-11-11, D-M2): catat target decoder supaya
        // reloadIfDecoderRateMismatch() bisa mendeteksi decoder yang dibuat
        // saat stream masih 0.
        decoderTargetRate_.store(cfg.targetSampleRate, std::memory_order_release);

        // Worker lokal dulu (M3): dipublikasikan ke decoderWorker_ hanya
        // setelah start() berhasil, di bawah lock.
        auto decoder = std::make_unique<decoder::FFmpegDecoder>(cfg);

        // 🔥 FIX (2026-11-11, D-M1): beri tahu base class format yang
        // BENAR-BENAR keluar dari decoder ini (target rate swr + stereo),
        // supaya getOutputFormat() jujur. Sebelumnya outputFormat_ selalu
        // default 48000/2 karena setTargetFormat tidak pernah dipanggil
        // siapa pun — bookkeeping format berbohong soal laju output.
        decoder::AudioFormat targetFormat;
        targetFormat.sampleRate = cfg.targetSampleRate;
        targetFormat.channels = 2;
        decoder->setTargetFormat(targetFormat);

        auto worker = std::make_shared<decoder::DecoderWorker>(
            std::move(decoder)
        );

        // 🔥 EOF callback: decoder selesai membaca seluruh stream.
        // Sebelumnya tidak di-set; JS menebak-nebak lewat __trackEndWatcher
        // polling (posisi stuck 3 detik → next). Sekarang C++ yang kasih tahu.
        //
        // ⚠️ Thread-safety: callback ini jalan di thread decoder. Memanggil
        // loadTrack() langsung di sini = stopDecoder() → decoderWorker_.reset()
        // → thread ini destroy object yang sedang menjalankannya (use-after-
        // free + deadlock join). Karena itu advance + loadTrack dijadwalkan
        // ke thread terpisah (lihat scheduleAdvance).
        //
        // ⚠️ URIPLENS: kirim currentTrack_.uri (URI ASLI yang diberikan ke
        // queue), BUKAN queue_->current() setelah advance. Setelah advance,
        // queue_->current() adalah trek BERIKUTNYA — JS menerima URI yang
        // salah, perbandingan dengan currentSong.uri gagal, dan auto-advance
        // UI mati (log terlihat: "skip: uri event ≠ currentSong.uri" untuk
        // setiap trek, padahal audio native sudah pindah).
        //
        // Selain itu URI yang disimpan queue bisa berbeda bentuk dari
        // currentSong.uri JS (Kotlin me-resolve content:// ke path cache).
        // Lihat emitTrackEnded di NativeEventEmitter: JS harus menangani
        // kedua bentuk.
        // 🔥 FIX (2026-11-12, B8-P2): ikat kedua callback ke generasi
        // decoder INI (nilai loadGen_ saat startDecoder — sudah
        // dinaikkan loadTrack() di atas). Dibaca di sini, BUKAN saat
        // callback menyala: lambda membaca URI fresh dari
        // currentTrack_, jadi kalau callback menyala telat (sesudah
        // loadTrack track berikutnya selesai), URI-nya sudah milik
        // track baru — tapi gen-nya tetap milik decoder lama, dan
        // scheduleAdvance menolaknya. Decoder yang sama (seek +
        // revive B8-P1) memegang gen yang sama, jadi EOF legit sesudah
        // seek tetap sah; seek sendiri sengaja tidak menaikkan gen.
        const uint64_t decoderGen =
            loadGen_.load(std::memory_order_acquire);

        worker->setEofCallback([this, decoderGen]() {
            __android_log_print(ANDROID_LOG_INFO, "PlaybackController",
                                "EOF callback: track ended, advancing queue");

            // 🔥 FIX (2026-10-06): anti-flood EOF.
            //
            // Kalau trek korup / 0-byte / tidak bisa di-decode, decoder
            // langsung EOF. loadTrack(next) juga EOF, dan setiap EOF memicu
            // emitTrackEnded ke JS ratusan kali per detik. Gejala di device:
            // "track-ended event: ...1000996760" diulang ratusan kali dan
            // posisi stuck (speed=0.01x).
            //
            // Guard: kalau EOF untuk URI yang SAMA datang terlalu cepat
            // (< 500ms), anggap decoder stuck dan berhenti. UI tidak perlu
            // ratusan event identik.
            const std::string uri = [&]() {
                // 🔥 FIX (2026-11-10, P-M4): salin di bawah lock. Dulu baca
                // currentTrack_.uri mentah dari thread decoder sementara
                // loadTrack() menulisnya dari thread JS/advance.
                std::lock_guard<std::recursive_mutex> lock(decoderMutex_);
                return currentTrack_.uri;
            }();
            const auto now = std::chrono::steady_clock::now();
            {
                // 🔥 FIX (2026-10-06): std::atomic<std::string> tidak valid
                // (std::string bukan trivially copyable, NDK tolak). Pakai
                // mutex — EOF callback hanya jalan di thread decoder, jadi
                // kontensi minimal.
                std::lock_guard<std::mutex> eofLock(eofMutex_);
                const bool sameTrack = (uri == lastEofUri_);
                const bool tooFast =
                    (now - lastEofTime_) < std::chrono::milliseconds(500);
                if (sameTrack && tooFast) {
                    __android_log_print(
                        ANDROID_LOG_WARN,
                        "PlaybackController",
                        "EOF flood: skip duplikat untuk %s (<500ms)",
                        uri.c_str()
                    );
                    return;
                }
                lastEofUri_ = uri;
                lastEofTime_ = now;
            }

            // Decoder selesai membaca file — tapi audio di queue BELUM habis
            // dimainkan (P-M1). Tandai supaya render() tahu ekor sudah dekat
            // (fade-out P-M7) dan advance thread tahu kapan drain selesai.
            decoderFinished_.store(true, std::memory_order_release);

            // Emit ke JS DITUNDA sampai advance benar-benar terjadi (lihat
            // scheduleAdvance): event "track-ended" harus berarti audio
            // track itu SUDAH habis terdengar, bukan decoder selesai baca.
            // Kalau di-emit di sini, JS syncFromNative saat ekor masih
            // dimainkan dan (setelah drain-wait P-M1) tidak pernah tahu
            // kapan track berikutnya mulai.
            scheduleAdvance(uri, decoderGen);
        });

        // 🔥 FIX (2026-11-10, P-M10): error decode (file korup / format
        // tidak didukung / I/O gagal di tengah decode) HARUS men-skip ke
        // track berikutnya. Sebelumnya error hilang diam-diam: worker log +
        // break, controller tidak pernah tahu, UI menampilkan "playing"
        // tanpa suara.
        //
        // Diperlakukan seperti EOF: tandai decoderFinished_ (audio yang
        // sudah di-decode tetap dimainkan sampai habis — drain-wait di
        // scheduleAdvance) lalu scheduleAdvance. Kalau decoder error di
        // awal (0 frame ter-decode), queue kosong dan advance langsung.
        //
        // Callback ini HANYA menyala dari cabang Error/FatalError/
        // NotSupported workerLoop (lihat DecoderWorker::
        // setDecodeErrorCallback) — error start/seek tidak lewat sini,
        // jadi seek gagal TIDAK men-skip track.
        worker->setDecodeErrorCallback([this, decoderGen](const std::string& message) {
            const std::string uri = [&]() {
                std::lock_guard<std::recursive_mutex> lock(decoderMutex_);
                return currentTrack_.uri;
            }();
            __android_log_print(ANDROID_LOG_ERROR, "PlaybackController",
                "decode error pada %s: %s — skip ke track berikutnya",
                uri.c_str(), message.c_str());
            decoderFinished_.store(true, std::memory_order_release);
            scheduleAdvance(uri, decoderGen);
        });

        // 🔥 FIX (2026-11-10, P-M4): callback menangkap weak_ptr ke worker
        // yang memilikinya, BUKAN membaca decoderWorker_ (member). Cabang
        // backpressure ini jalan di thread decoder di bawah decodeMutex_;
        // membaca member tanpa lock di sini adalah TOCTOU yang sama seperti
        // di play()/pause()/seek(). weak_ptr memastikan
        // pauseForBackpressure() hanya menyasar worker yang benar-benar
        // memproduksi data ini — kalau worker sudah diganti loadTrack,
        // lock() gagal dan cabang dilewati (queue baru saja di-clear
        // loadTrack, jadi tidak ada yang perlu di-pause).
        worker->setDecodeCallback(
            [this, weakWorker = std::weak_ptr<decoder::DecoderWorker>(worker)](
                decoder::DecodeResult&& result) {
                if (pcmQueue_ && !result.samples.empty()) {
                    // PB6-W5 (2026-11-12): wait-for-space, bukan buang.
                    //
                    // Dulu chunk yang tidak muat langsung dibuang
                    // sebagian (written < size -> recordOverrun + DATA
                    // DROP). Backpressure 90% + chunk 8192 sample
                    // (0,20% dari kapasitas 2^22) membuat queue penuh
                    // praktis tak terjangkau steady state — tapi saat
                    // TERTUNDA (render starve sesaat) drop itu nyata.
                    // Sekarang: tunggu sampai ada ruang, sleep 2 ms
                    // per cek, lalu tulis penuh.
                    //
                    // KENAPA WAIT INI TIDAK DEADLOCK — callback berjalan
                    // di thread decoder DI BAWAH decodeMutex_ (workerLoop
                    // memegangnya selama decode+callback), dan render
                    // berhenti menguras saat paused, jadi wait tanpa
                    // cek batal = gantung selamanya + pause()/seek()/
                    // stop() yang butuh lock itu ikut macet. Dua cek
                    // batal di bawah MENUTUP semua pemegang lock itu:
                    //  * paused_ eksplisit — pause() controller men-store
                    //    paused_=true SEBELUM block di decodeMutex_
                    //    (DecoderWorker::pause), dan seek() memanggil
                    //    pause() dulu sebelum clear/seek. Jadi jeda
                    //    user/seek SELALU terlihat dari wait ini walau
                    //    lock sedang dipegang callback.
                    //  * stopRequested_ — stop() men-store ini SEBELUM
                    //    join thread decoder (DecoderWorker::stop), dan
                    //    stopDecoder()/loadTrack() lewat jalur yang sama.
                    //  * Batas 1 dtk — katup pengaman untuk kasus render
                    //    tidak pernah menguras tanpa pause/stop (mis.
                    //    stream gagal start): jatuh ke perilaku LAMA
                    //    (tulis sebagian + DATA DROP di bawah), bukan
                    //    gantung. Satu chunk terkuras ~85 ms @48kHz
                    //    stereo, jadi 1 dtk >10x longgar.
                    // Jalur lain tidak butuh lock ini: resume() /
                    // pauseForBackpressure() hanya atomic store +
                    // notify, render() tidak menyentuh decodeMutex_,
                    // freeSamples() lock-free.
                    if (auto w = weakWorker.lock()) {
                        const auto waitStart =
                            std::chrono::steady_clock::now();
                        while (pcmQueue_->freeSamples() <
                               result.samples.size()) {
                            if (w->isExplicitlyPaused() ||
                                w->isStopRequested()) {
                                break;
                            }
                            if (std::chrono::steady_clock::now() -
                                    waitStart >
                                std::chrono::milliseconds(1000)) {
                                break;
                            }
                            std::this_thread::sleep_for(
                                std::chrono::milliseconds(2));
                        }
                    }

                    size_t written = pcmQueue_->write(
                        result.samples.data(),
                        result.samples.size()
                    );

                    // 🔥 FIX 1: detect data drop (silent overflow)
                    // PB6-MINOR(e): tulisan yang dibuang karena epoch
                    // (clear() balapan, kWriteDiscardedEpoch) BUKAN drop —
                    // jangan catat overrun untuknya.
                    if (written != PCMQueue::kWriteDiscardedEpoch &&
                        written < result.samples.size()) {
                        // Overrun nyata: decoder memproduksi lebih cepat
                        // daripada queue dikonsumsi. Catat ke metrik (M5) —
                        // dulu counter overrun selalu 0 karena tidak ada yang
                        // menulisnya.
                        if (metricsEngine_) {
                            metricsEngine_->recordOverrun();
                        }
                        static int dropCount = 0;
                        dropCount++;
                        if (dropCount % 20 == 0) {
                            __android_log_print(ANDROID_LOG_WARN, "PlaybackController",
                                "DATA DROP: wrote %zu/%zu (queue %zu/%zu) [total drops=%d]",
                                written, result.samples.size(),
                                pcmQueue_->availableSamples(),
                                pcmQueue_->capacitySamples(),
                                dropCount);
                        }
                    }

                    // 🔥 FIX 2: pause decoder kalau queue 90% (turun dari 80%)
                    //
                    // FIX (2026-10-06, "96kHz masih cacat"): threshold 80%/40%
                    // menciptakan jendela 40% (~8.7 detik audio) di mana decoder
                    // idle. FLAC 96kHz butuh throughput 2x MP3 48k untuk jumlah
                    // output sama; saat di-pause berkali-kali, sleep+lock
                    // overhead membuat loop hanya 11/detik x 2238 = 24.8k fps —
                    // di bawah 48k realtime → queue habis → NaN di render.
                    // Jendela 30% lebih sempit = decoder lebih serang.
                    //
                    // PB6-W2A (2026-11-12): ini jeda BACKPRESSURE, bukan
                    // jeda eksplisit — pakai pauseForBackpressure(),
                    // BUKAN pause(). Resume-nya ditangani thread decoder
                    // sendiri (timed wait 10 ms + predikat auto-resume
                    // di bawah, setAutoResumeCheck); render() tidak lagi
                    // me-resume. Jeda eksplisit (user pause / seek)
                    // memakai flag terpisah dan tidak pernah dilepas
                    // predikat ini.
                    size_t avail = pcmQueue_->availableSamples();
                    size_t cap = pcmQueue_->capacitySamples();
                    if (avail > cap * 90 / 100) {
                        if (auto w = weakWorker.lock()) {
                            if (!w->isPaused()) {
                                w->pauseForBackpressure();
                                static int pauseCount = 0;
                                pauseCount++;
                                if (pauseCount % 20 == 0) {
                                    __android_log_print(ANDROID_LOG_INFO, "PlaybackController",
                                        "Decoder PAUSED (queue %zu%% full) [total pauses=%d]",
                                        100 * avail / cap, pauseCount);
                                }
                            }
                        }
                    }
                }
            }
        );

        // PB6-W2A (2026-11-12): decoder memantau level queue SENDIRI.
        //
        // Dulu render() (audio thread) yang me-resume decoder tiap
        // callback saat queue < 60% — snapshotWorker() + resume() per
        // callback. Sekarang worker yang backpressure-paused bangun
        // tiap 10 ms dan menanyakan predikat ini; audio thread tidak
        // lagi menyentuh worker.
        //
        // Predikat ini membawa DUA gerbang yang dulu ada di render()
        // — JANGAN dihapus tanpa memahami riwayatnya:
        //  * playing_: resume saat user pause menghidupkan lagi audio
        //    (bug 2026-10-10: 2x "pause() called" tapi MediaSession
        //    tetap PLAYING, posisi merangkak 4136→5160→6168). Saat
        //    paused, render tidak menguras queue (cabang senyap P-M2),
        //    jadi level queue tidak turun dan predikat ini tetap false.
        //  * fade-out pause (PB6-W4): selama 15 ms fade, playing_
        //    masih true dan render menguras queue — tanpa gerbang ini
        //    decoder mengisi lagi queue yang baru dijeda.
        //
        // Sengaja TIDAK ada gerbang seek di sini: jeda seek memakai
        // pause() EKSPLISIT (flag terpisah di worker), dan predikat ini
        // hanya dievaluasi untuk jeda backpressure — jadi queue yang
        // di-clear seek (avail 0 < 60%) tidak pernah me-resume decoder
        // di tengah seek.
        //
        // Lifetime: worker dimiliki controller dan thread-nya di-join
        // stopDecoder() sebelum worker dihancurkan, jadi menangkap
        // `this` di sini sama amannya dengan callback EOF/decode-error
        // di atas. pcmQueue_ ditangkap sebagai shared_ptr (bukan
        // member mentah) supaya predikat tetap valid.
        worker->setAutoResumeCheck([this, queue = pcmQueue_]() {
            if (!queue) return false;
            if (!playing_.load(std::memory_order_acquire)) return false;
            if (pauseFadeRemainingFrames_.load(std::memory_order_acquire) > 0) {
                return false;
            }
            const size_t avail = queue->availableSamples();
            const size_t cap = queue->capacitySamples();
            return cap > 0 && avail < cap * 60 / 100;
        });

        bool ok = worker->start(track.uri, 0.0);
        __android_log_print(ANDROID_LOG_INFO, "PlaybackController",
                            "startDecoder(): ok=%d, uri=%s",
                            ok ? 1 : 0, track.uri.c_str());

        if (!ok) {
            // start gagal: jangan publikasikan. Worker lokal dihancurkan di
            // sini — destructor-nya memanggil stop() (join) sendiri.
            __android_log_print(ANDROID_LOG_ERROR, "PlaybackController",
                                "startDecoder(): FAILED, worker dibuang");
            return false;
        }

        // Publikasikan di bawah lock: render() hanya membaca pointer lewat
        // snapshot di bawah lock yang sama, jadi tidak pernah melihat
        // setengah-bangun. (Menimpa worker lama di sini aman: shared_ptr
        // lama tetap hidup di tangan siapa pun yang sudah menyalinnya, dan
        // destructor-nya join sendiri saat referensi terakhir hilang.)
        {
            std::lock_guard<std::recursive_mutex> lock(decoderMutex_);
            decoderWorker_ = worker;
        }

        return true;
    }
    catch (const std::exception& e) {
        __android_log_print(ANDROID_LOG_ERROR, "PlaybackController",
                            "startDecoder(): exception: %s", e.what());
        return false;
    }
    catch (...) {
        __android_log_print(ANDROID_LOG_ERROR, "PlaybackController",
                            "startDecoder(): unknown exception");
        return false;
    }
}

void PlaybackController::stopDecoder() {
    // 🔥 FIX (2026-11-10, M3): JANGAN tahan decoderMutex_ melewati stop().
    //
    // Dulu: lock → worker->stop() (join thread decoder + FFmpeg close) →
    // reset. Selama join itu, audio thread yang sedang render() ikut
    // ter-block di lock yang sama → dropout/glitch di tiap ganti track.
    //
    // Sekarang: pindahkan worker keluar di bawah lock, lalu stop() DI LUAR
    // lock. Invarian 2026-10-09 tetap terjaga: unique_ptr hanya disentuh di
    // bawah lock, jadi render() tidak pernah melihat pointer setengah-reset.
    // Worker tetap hidup (dipegang unique_ptr lokal) sampai stop() selesai,
    // jadi resume() dari play()/seek() yang sudah terlanjur masuk tidak pernah
    // use-after-free — dan resume() sendiri hanya atomic store + notify,
    // aman dipanggil bersamaan dengan stop(). (PB6-W2A: render() tidak
    // lagi me-resume — satu-satunya pemanggil resume() kini play()/seek().)
    std::shared_ptr<decoder::DecoderWorker> worker;
    {
        std::lock_guard<std::recursive_mutex> lock(decoderMutex_);
        worker = decoderWorker_;
        decoderWorker_.reset();
    }

    // 🔥 FIX (2026-11-11, D-M2): tidak ada decoder lagi — target yang
    // dicatat tidak boleh memicu reload basi.
    decoderTargetRate_.store(0, std::memory_order_release);

    if (worker) {
        worker->stop();
    }
}

// PB6-W3: advance queue + loadTrack setelah EOF, di worker permanen.
//
// EOF callback jalan di thread decoder (di bawah decodeMutex_ workerLoop).
// Kalau loadTrack() dipanggil di sana, stopDecoder() akan join thread
// yang sedang berjalan → deadlock, dan decoderWorker_.reset()
// menghancurkan object dari dalam dirinya sendiri → use-after-free.
// Dulu ini dipecah dengan spawn thread baru per advance — tapi
// scheduleAdvance() lama me-join thread lama tanpa mutex (data race +
// system_error tak tertangkap → terminate) dan join dari thread decoder
// bisa menggantung ~20 dtk saat advance lama drain-wait.
//
// Sekarang: scheduleAdvance() HANYA mem-post permintaan ke worker
// permanen (advanceWorkerLoop) — tanpa join. Worker yang menjalankan
// drain-wait + advance + loadTrack.
void PlaybackController::scheduleAdvance(const std::string& finishedUri,
                                         uint64_t gen) {
    // PB6-W3 (c): tolak post basi — URI sudah bukan track aktif. Post
    // dari callback decoder lama bisa mendarat SESUDAH cancel next()/
    // previous() (callback tertunda di thread decoder sementara loadTrack
    // manual sudah pindah track): post seperti itu membersihkan flag
    // lewat jalurnya sendiri, jadi flag saja tidak menutupnya. Cek di
    // bawah decoderMutex_ — pola yang sama dengan pembacaan
    // currentTrack_.uri di callback EOF / decode-error; aman dari thread
    // decoder (tidak ada jalur balik decoderMutex_ -> decodeMutex_).
    {
        std::lock_guard<std::recursive_mutex> lock(decoderMutex_);
        if (finishedUri != currentTrack_.uri) {
            __android_log_print(ANDROID_LOG_INFO, "PlaybackController",
                "scheduleAdvance: abaikan post basi untuk %s (track aktif %s)",
                finishedUri.c_str(), currentTrack_.uri.c_str());
            return;
        }
    }

    // B8-P2: tolak post dari generasi lama — decoder yang mem-post sudah
    // diganti loadTrack()/stop() sesudah callback-nya dibuat. Cek ini
    // menutup yang tidak ditutup cek URI: lambda membaca URI fresh dari
    // currentTrack_, jadi callback telat membawa URI track aktif (B)
    // padahal asalnya dari decoder lama (A) — gen yang diikat di lambda
    // saat startDecoder membongkar penyamaran itu. Atomic load, tanpa
    // lock; bump loadGen_ hanya di bawah loadTrackMutex_ (loadTrack/
    // stop), jadi tidak ada race dengan cek ini.
    if (gen != loadGen_.load(std::memory_order_acquire)) {
        __android_log_print(ANDROID_LOG_INFO, "PlaybackController",
            "scheduleAdvance: abaikan post generasi basi %llu "
            "(aktif %llu) untuk %s",
            static_cast<unsigned long long>(gen),
            static_cast<unsigned long long>(
                loadGen_.load(std::memory_order_acquire)),
            finishedUri.c_str());
        return;
    }

    // Post permintaan (leaf lock saja — lihat urutan lock di header).
    // Advance baru = pembatalan sebelumnya tidak berlaku lagi.
    {
        std::lock_guard<std::mutex> lock(advanceMutex_);
        advanceFinishedUri_ = finishedUri;
        advanceGen_ = gen;
        advancePending_ = true;
        advanceCancelled_.store(false, std::memory_order_release);
    }
    advanceCv_.notify_one();
}

// PB6-W3: loop worker advance permanen. Hidup sejak initialize() sampai
// shutdown(); di antara permintaan, tidur di condition_variable.
void PlaybackController::advanceWorkerLoop() {
    while (true) {
        std::string finishedUri;
        uint64_t gen = 0;
        {
            std::unique_lock<std::mutex> lock(advanceMutex_);
            advanceCv_.wait(lock, [this] {
                return advanceStopRequested_ || advancePending_;
            });
            if (advanceStopRequested_) return;
            finishedUri = std::move(advanceFinishedUri_);
            advanceFinishedUri_.clear();
            gen = advanceGen_;
            advanceGen_ = 0;
            advancePending_ = false;
            advanceBusy_ = true;
        }

        // processAdvance tidak boleh membunuh worker permanen: exception
        // yang lolos (bukan dari loadTrack — ia menangkap sendiri) dicatat
        // dan worker kembali menunggu permintaan berikutnya. Dulu exception
        // di thread advance sekali pakai = std::terminate.
        try {
            processAdvance(finishedUri, gen);
        } catch (const std::exception& e) {
            __android_log_print(ANDROID_LOG_ERROR, "PlaybackController",
                "advanceWorkerLoop: exception saat memproses advance (%s) - "
                "worker tetap hidup", e.what());
        } catch (...) {
            __android_log_print(ANDROID_LOG_ERROR, "PlaybackController",
                "advanceWorkerLoop: unknown exception saat memproses advance "
                "- worker tetap hidup");
        }

        {
            std::lock_guard<std::mutex> lock(advanceMutex_);
            advanceBusy_ = false;
        }
        advanceCv_.notify_all();
    }
}

void PlaybackController::processAdvance(const std::string& finishedUri,
                                        uint64_t gen) {
    if (!queue_) return;

    // 🔥 FIX (2026-11-10, P-M1): TUNGGU ekor track habis dimainkan dulu.
    //
    // Sebelumnya scheduleAdvance langsung loadTrack → pcmQueue_->clear()
    // membuang audio yang sudah di-decode tapi belum dimainkan. Decoder
    // jalan 26–39 dtk di depan playback (queue 43,7 dtk @48k, pause 90% /
    // resume 60%), jadi tiap auto-advance memotong ekor sepanjang itu.
    //
    // Sekarang: decoder sudah selesai (EOF), tidak ada lagi yang mengisi
    // queue — available hanya berkurang lewat render(). Tunggu sampai
    // queue kosong, atau sampai dibatalkan (stop/loadTrack/shutdown).
    // Kalau user pause di tengah ekor, drain berhenti (render tidak
    // menarik saat paused, P-M2) dan thread ini menunggu sampai resume
    // atau batal — ekor tidak hilang.
    //
    // PB6-W3: tidur diganti wait_for 20 ms di CV supaya batal/berhenti
    // membangunkan segera (semantik sama: cek ulang tiap ≤20 ms).
    while (true) {
        if (advanceCancelled_.load(std::memory_order_acquire)) {
            __android_log_print(ANDROID_LOG_INFO, "PlaybackController",
                "scheduleAdvance: dibatalkan saat menunggu drain");
            return;
        }
        // B8-P2: buang post generasi basi — loadTrack()/stop() menaikkan
        // loadGen_ selama drain-wait (jendela sampai 26–39 dtk). Cek
        // ini yang menutup post yang lolos cek saat post: cek post dan
        // bump bisa balapan (post membaca loadGen_ sesaat sebelum bump),
        // dan post yang dibuat sebelum load dimulai memang sah saat
        // dibuat. Flag batal saja tidak cukup di sini: post telat
        // membersihkan flag lewat jalurnya sendiri, gen tidak.
        // Bangunannya dijamin: tiap bump gen didahului cancel +
        // notify (loadTrack/stop/shutdown), jadi worker tidak tidur
        // melewati perubahan gen lebih dari satu siklus wait 20 ms.
        if (gen != loadGen_.load(std::memory_order_acquire)) {
            __android_log_print(ANDROID_LOG_INFO, "PlaybackController",
                "scheduleAdvance: abaikan post generasi basi %llu "
                "(aktif %llu) saat menunggu drain",
                static_cast<unsigned long long>(gen),
                static_cast<unsigned long long>(
                    loadGen_.load(std::memory_order_acquire)));
            return;
        }
        {
            std::lock_guard<std::mutex> lock(advanceMutex_);
            if (advanceStopRequested_) return;
        }
        if (!pcmQueue_) return;
        if (pcmQueue_->availableSamples() == 0) break;
        std::unique_lock<std::mutex> lock(advanceMutex_);
        advanceCv_.wait_for(lock, std::chrono::milliseconds(20), [this] {
            return advanceCancelled_.load(std::memory_order_acquire) ||
                   advanceStopRequested_;
        });
    }

    if (advanceCancelled_.load(std::memory_order_acquire)) return;
    {
        std::lock_guard<std::mutex> lock(advanceMutex_);
        if (advanceStopRequested_) return;
    }

    // PB6-W3: seksi kritis — advance() + loadTrack() atomik terhadap
    // advanceManual()/retreat() + loadTrack() di next()/previous()
    // (keduanya memegang loadTrackMutex_ yang sama — lihat (a) di header).
    // B8-P3: unique_lock (bukan lock_guard) supaya lock bisa dilepas
    // eksplisit sebelum emitTrackEnded di akhir fungsi — panggilan JNI
    // tidak boleh jalan di dalam critical section (hygiene; premis
    // deadlock opinion salah karena emit fire-and-forget dan tidak
    // menunggu JS, tapi hold lock tetap dipersingkat).
    std::unique_lock<std::recursive_mutex> loadLock(loadTrackMutex_);

    // Cek-batal DI DALAM lock (lihat (b) di header): cancel yang terjadi
    // sebelum akuisisi ini terlihat di sini; cancel sesudahnya ter-block
    // sampai seksi kritis selesai. Tanpa cek ini, worker yang lolos cek
    // drain terakhir tetap menggeser indeks sesudah navigasi manual.
    if (advanceCancelled_.load(std::memory_order_acquire)) return;
    // B8-P2: cek gen DI DALAM lock, pasangan cek drain di atas — load
    // manual yang mendarat di antara cek drain terakhir dan akuisisi
    // lock ini sudah menaikkan loadGen_, dan cancel-nya bisa sudah
    // dibersihkan post telat; gen adalah satu-satunya penanda yang
    // tidak bisa dibersihkan post.
    if (gen != loadGen_.load(std::memory_order_acquire)) {
        __android_log_print(ANDROID_LOG_INFO, "PlaybackController",
            "scheduleAdvance: abaikan post generasi basi %llu "
            "(aktif %llu) sesudah loadLock",
            static_cast<unsigned long long>(gen),
            static_cast<unsigned long long>(
                loadGen_.load(std::memory_order_acquire)));
        return;
    }
    if (!queue_) return;

    // 🔥 FIX (2026-11-10, P-M10): lewati track yang tidak bisa dimuat.
    //
    // loadTrack() gagal kalau startDecoder gagal (file korup / tidak
    // bisa dibuka) — sebelumnya advance berhenti diam-diam di situ:
    // tidak ada emit, tidak ada advance lagi, UI "playing" tanpa suara.
    // Sekarang: coba track berikutnya sampai ada yang berhasil dimuat.
    //
    // Batas percobaan = ukuran queue — melindungi Repeat One: advance()
    // mengembalikan true TANPA pindah di bawah One, jadi tanpa batas,
    // satu-satunya track yang korup membuat loop ini tidak pernah
    // berakhir. (Satu track korup di bawah One = queue habis setelah
    // N percobaan, masuk cabang exhausted di bawah.)
    //
    // CATATAN PB6-W3: TIDAK ada cek-batal di dalam loop retry — loadTrack()
    // sendiri memanggil cancelPendingAdvance() di awal, jadi flag sudah
    // true sesudah percobaan pertama; cek di sini akan membunuh retry
    // P-M10. Pembatalan dari luar tidak mungkin masuk ke sini: next()/
    // previous()/play()/seek() butuh loadTrackMutex_ yang sedang dipegang
    // worker, dan stop() menunggu worker idle dulu.
    const size_t maxAttempts = std::max<size_t>(queue_->size(), 1);
    bool loaded = false;
    for (size_t attempt = 0; attempt < maxAttempts; ++attempt) {
        if (!queue_->advance()) break;
        auto nextTrack = queue_->current();
        if (!nextTrack) break;
        __android_log_print(
            ANDROID_LOG_INFO, "PlaybackController",
            "advance: next track uri=%s (attempt %zu/%zu)",
            nextTrack->uri.c_str(), attempt + 1, maxAttempts);
        if (loadTrack(*nextTrack)) {
            loaded = true;
            break;
        }
        __android_log_print(
            ANDROID_LOG_WARN, "PlaybackController",
            "advance: loadTrack gagal untuk %s, coba berikutnya",
            nextTrack->uri.c_str());
    }

    if (loaded) {
        // Ekor track lama SUDAH habis terdengar — sekarang waktunya JS
        // tahu track itu berakhir (emit di bawah, sesudah lock dilepas).
    } else {
        __android_log_print(ANDROID_LOG_INFO, "PlaybackController",
                            "advance: queue exhausted (repeat off atau "
                            "semua track gagal dimuat)");
        // 🔥 FIX (2026-11-10, p-m4): antrean habis = status Completed,
        // bukan Playing yang membeku di akhir trek. JS polling
        // status === 1 (Playing) jadi tahu playback benar-benar selesai.
        // PB6-W4: batalkan juga fade-out pause yang kebetulan sedang
        // berjalan — kalau tidak, render menyelesaikan fade sesudah ini
        // dan menimpa Completed dengan Paused lewat updatePlaybackState.
        pauseFadeRemainingFrames_.store(0, std::memory_order_release);
        playing_.store(false, std::memory_order_release);
        if (state_) state_->setStatus(PlaybackStatus::Completed);
        // Emit di bawah, sesudah lock dilepas.
    }

    // B8-P3: emitTrackEnded keluar dari loadLock scope. Kedua cabang di
    // atas meng-emit URI yang sama (finishedUri), jadi satu emit di sini
    // cukup. Satu-satunya data yang dibutuhkan emit adalah URI track
    // yang selesai — disalin ke lokal DI DALAM lock; emit memakai
    // salinan itu sesudah lock dilepas, jadi tidak ada bacaan state
    // bersama sesudah unlock. Urutan observabel tidak berubah: emit
    // tetap terjadi sesudah advance + loadTrack sukses (atau sesudah
    // exhausted + status Completed diputuskan), sebelum processAdvance
    // kembali ke worker loop.
    const std::string endedUri = finishedUri;
    loadLock.unlock();
    pristine::playback::emitTrackEnded(endedUri);
}

void PlaybackController::waitForAdvanceIdle() {
    std::unique_lock<std::mutex> lock(advanceMutex_);
    advanceCv_.wait(lock, [this] { return !advanceBusy_; });
}

void PlaybackController::cancelPendingAdvance() noexcept {
    // PB6-W3: ambil loadTrackMutex_ sebentar saat menaikkan flag — lihat
    // (b) pada komentar advanceWorker_ di header. Tanpa ini, flag yang
    // dibaca worker di dalam seksi kritisnya bisa ketinggalan cancel yang
    // mendarat di antara cek-batal drain terakhir dan advance().
    //
    // Aman: recursive — loadTrack()/play() yang sudah memegang mutex
    // (thread yang sama) tidak deadlock; stop()/shutdown()/next()/
    // previous() belum memegangnya di titik ini. Lock dilepas sebelum
    // kembali: stop() tetap menunggu worker idle TANPA lock (PB2-M1),
    // dan worker tidak pernah menunggu cancel sambil memegang mutex
    // (drain-wait jalan di luar loadTrackMutex_).
    std::lock_guard<std::recursive_mutex> loadLock(loadTrackMutex_);
    advanceCancelled_.store(true, std::memory_order_release);
    // Bangunkan worker kalau sedang drain-wait di CV (atau menunggu
    // permintaan — predikatnya tidak berubah, jadi kembali tidur).
    advanceCv_.notify_all();
}

void PlaybackController::waitForRenderIdle() noexcept {
    // clearing_ SUDAH dikibarkan pemanggil: render baru langsung return
    // senyap tanpa membaca queue. Yang ditunggu di sini hanya render yang
    // sudah terlanjur masuk sebelum clearing_ naik. Timeout 100 ms (5x
    // periode callback) supaya tidak menggantung kalau audio thread macet;
    // setelah timeout, clear() tetap aman (satu atomic store — hanya data
    // basi ≤1 callback, seperti perilaku lama).
    // PB6-B2: load renderActive_ di bawah seq_cst — pasangan Dekker dari
    // store clearing_=true pemanggil (lihat komentar di RenderActiveGuard).
    const auto deadline =
        std::chrono::steady_clock::now() + std::chrono::milliseconds(100);
    while (renderActive_.load(std::memory_order_seq_cst) > 0) {
        if (std::chrono::steady_clock::now() >= deadline) {
            __android_log_print(ANDROID_LOG_WARN, "PlaybackController",
                "waitForRenderIdle: timeout, lanjut (render masih jalan)");
            return;
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(1));
    }
}

void PlaybackController::applyTrackFades(float* output, uint32_t frames,
                                        uint32_t channels,
                                        size_t inputReadSamples,
                                        float rate) noexcept {
    if (!output || frames == 0 || channels == 0) return;

    // ---- fade-in: awal track sejak loadTrack/seek/play ----
    // B8-M1: pilih set kurva PER CALLBACK dari processingAllowed_
    // saat ini (300 ms di mode processing, 10 ms anti-klik di
    // bit-perfect, PB6-W1) — bukan dari mode saat load. Hanya atomic
    // load + pilih referensi ke kurva yang sudah dibangun loadTrack();
    // tanpa alokasi di audio thread.
    // (framesSinceLoad_ di sini = nilai SEBELUM callback ini, karena
    // increment-nya terjadi di blok clock advance setelah pemanggilan ini.)
    const bool processingAllowed =
        processingAllowed_.load(std::memory_order_acquire);
    const FadeEngine& fadeIn = processingAllowed
        ? fadeInProcessing_ : fadeInBitPerfect_;
    const FadeEngine& fadeOut = processingAllowed
        ? fadeOutProcessing_ : fadeOutBitPerfect_;
    const uint32_t sinceLoad =
        framesSinceLoad_.load(std::memory_order_acquire);
    const uint32_t fadeInFrames = fadeIn.durationFrames();
    if (!fadeIn.empty() && sinceLoad < fadeInFrames) {
        fadeIn.applyFadeIn(output, frames, channels, sinceLoad);
    }

    // ---- fade-out: ekor track (500 ms di mode processing, 10 ms
    // anti-klik di bit-perfect — set yang sama dipilih di atas),
    // hanya kalau decoder sudah selesai ----
    // Decoder selesai = tidak ada lagi audio yang akan masuk queue, jadi
    // sisa queue saat ini adalah EKOR track yang sebenarnya. (Tanpa flag
    // ini, fade-out akan salah memotong tengah track setiap kali queue
    // kebetulan tinggal sedikit.)
    if (!fadeOut.empty() &&
        decoderFinished_.load(std::memory_order_acquire)) {
        const uint32_t fadeOutFrames = fadeOut.durationFrames();
        // Sisa dalam frame OUTPUT (yang didengar): queue + yang baru dibaca
        // adalah frame INPUT — bagi rate (di 2x, 1000 frame input tinggal
        // 500 frame output).
        const size_t remainingInputSamples =
            (pcmQueue_ ? pcmQueue_->availableSamples() : 0) + inputReadSamples;
        const float safeRate = (rate > 0.0f) ? rate : 1.0f;
        const uint32_t remainingFrames = static_cast<uint32_t>(
            (remainingInputSamples / channels) / safeRate);
        if (remainingFrames <= fadeOutFrames) {
            // Frame pertama buffer ini berada di posisi
            // (fadeOutFrames - remainingFrames) dalam kurva fade-out.
            fadeOut.applyFadeOut(output, frames, channels,
                                  fadeOutFrames - remainingFrames);
        }
    }
}

void PlaybackController::updatePlaybackState() {
    if (!state_)
        return;

    const bool isPlaying = playing_.load(std::memory_order_acquire);

    state_->setStatus(
        isPlaying
            ? PlaybackStatus::Playing
            : PlaybackStatus::Paused
    );
    // 🔥 DIPANGKAS (2026-11-10, dead-code playback): sinkronisasi current
    // track ke state dihapus — setCurrentTrack hanya ditulis di sini tanpa
    // satu pun pembaca (getCurrentTrack 0 caller); member + setter/getter
    // dihapus dari PlaybackState.
}

} // namespace pristine::playback 