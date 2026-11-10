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

    // 2^19 = 524288 float samples = ~5.5 sec stereo @ 48kHz
    // WAJIB power of 2: PCMQueue pakai bitmask, bukan modulo!
    pcmQueue_ = std::make_shared<PCMQueue>(1 << 21);  // 🔥 21.8s buffer
    clock_ = std::make_shared<PlaybackClock>();
    metrics_ = std::make_shared<MetricsCollector>();
    state_ = std::make_shared<PlaybackState>();
    queue_ = std::make_shared<TrackQueue>();

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

    stopDecoder();

    // 🔥 Join advance thread: kalau lagi loadTrack untuk track berikutnya,
    // harus selesai sebelum resource di-reset di bawah.
    if (advanceThread_.joinable()) {
        advanceThread_.join();
    }

    playing_.store(false);
    stopping_.store(true);

    pcmQueue_.reset();
    clock_.reset();
    metrics_.reset();
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

std::shared_ptr<MetricsCollector> PlaybackController::metrics() const noexcept {
    return metrics_;
}

std::shared_ptr<PlaybackClock> PlaybackController::clock() const noexcept {
    return clock_;
}

std::shared_ptr<PCMQueue> PlaybackController::pcmQueue() const noexcept {
    return pcmQueue_;
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

// =====================================================
// TRANSPORT
// =====================================================

bool PlaybackController::loadTrack(const TrackInfo& track) {
    if (!initialized_.load(std::memory_order_acquire)) {
        __android_log_print(ANDROID_LOG_ERROR, "PlaybackController",
                            "loadTrack(): FAILED - not initialized");
        return false;
    }

    __android_log_print(ANDROID_LOG_INFO, "PlaybackController",
                        "loadTrack(): START uri=%s", track.uri.c_str());

    // 🔥 FIX (2026-11-10, P-M1/P-M3): loadTrack manual (next/prev/jumpTo/play)
    // membatalkan advance yang sedang menunggu drain dari EOF sebelumnya —
    // navigasi manual menang, advance basi tidak boleh memuat track lain
    // setelahnya.
    cancelPendingAdvance();

    stopDecoder();
    clearing_.store(true, std::memory_order_release);
    std::this_thread::sleep_for(std::chrono::milliseconds(10));

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

    // 🔥 FIX: set duration dari metadata track
    if (state_ && track.durationMs > 0) {
        state_->setDuration(static_cast<uint64_t>(track.durationMs));
    }

    // Decoder baru = file belum selesai dibaca. (P-M1: flag ini yang memberi
    // tahu render() bahwa ekor track sudah dekat untuk fade-out P-M7.)
    decoderFinished_.store(false, std::memory_order_release);

    bool result = startDecoder(track);
    clearing_.store(false, std::memory_order_release);
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
    bool needsLoad = !worker || track->uri != currentUri;

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

    playing_.store(true, std::memory_order_release);
    updatePlaybackState();  // 🔥 FIX

    // resume() di salinan aman walau stopDecoder() berjalan bersamaan:
    // resume() hanya atomic store + notify (lihat M3).
    worker->resume();

    __android_log_print(ANDROID_LOG_INFO, "PlaybackController",
                        "play(): SUCCESS");
    return true;
}

bool PlaybackController::pause() {
    playing_.store(false, std::memory_order_release);
    updatePlaybackState();  // 🔥 FIX

    // 🔥 FIX (2026-11-10, P-M4): pakai snapshot, bukan baca member mentah.
    // pause() boleh block di decodeMutex_ sampai chunk selesai (p-m22), jadi
    // dipanggil DI LUAR decoderMutex_ supaya render() tidak ikut ter-block.
    if (auto worker = snapshotWorker()) {
        worker->pause();
    }

    return true;
}

bool PlaybackController::stop() {
    playing_.store(false, std::memory_order_release);

    // 🔥 FIX (2026-11-10, P-M3): batalkan + join advance thread. Sebelumnya
    // stop() tidak menyentuh advanceThread_ sama sekali: EOF yang datang
    // sesaat sebelum stop membuat loadTrack tetap jalan di thread itu dan
    // menghidupkan lagi audio setelah stop (render tanpa gate playing, P-M2).
    // Cancel dulu supaya join tidak menggantung sampai drain selesai (bisa
    // ~20 dtk kalau user pause di tengah ekor).
    cancelPendingAdvance();
    if (advanceThread_.joinable()) {
        advanceThread_.join();
    }

    stopDecoder();

    pcmQueue_->clear();
    clock_->reset();

    // 🔥 FIX (2026-11-10, p-m23): reset laju file/stream supaya tidak basi
    // ke siklus start berikutnya (pola sama dengan m5 audit manager+core).
    fileSampleRate_.store(0, std::memory_order_release);
    streamSampleRate_.store(0, std::memory_order_release);

    // 🔥 FIX (2026-11-10, p-m4): stop = Stopped, bukan Paused.
    // updatePlaybackState() hanya tahu Playing/Paused (dari playing_), jadi
    // status di-set eksplisit di sini dan updatePlaybackState() TIDAK
    // dipanggil — kalau dipanggil, Stopped langsung tertimpa Paused lagi.
    if (state_) state_->setStatus(PlaybackStatus::Stopped);

    return true;
}

bool PlaybackController::seek(double seconds) {
    // 🔥 FIX (2026-11-10, P-M4): pakai snapshot. Dulu cek-lalu-pakai
    // decoderWorker_ tanpa lock; kalau stopDecoder() memindahkan pointer di
    // antara cek (:306) dan pause()/seek() (:315/:335) → deref null. Salinan
    // shared_ptr menjaga objek hidup walau member sudah diganti; seek pada
    // worker lama yang sudah di-stop mengembalikan false dengan bersih
    // (decoder sudah close) alih-alih crash.
    auto worker = snapshotWorker();
    if (!worker)
        return false;

    // 🩹 FIX (Prioritas 2): PCMQueue adalah SPSC lock-free ring buffer
    // — HANYA aman diakses oleh 1 producer (decoder thread) + 1
    // consumer (audio callback thread). clear() dari thread ketiga
    // (JNI/seek caller) bisa menyebabkan writeIndex_/readIndex_ desync
    // kalau kebetulan race dengan decoder thread yang masih write().
    // Fix: pause producer dulu supaya tidak ada writer aktif saat clear.
    worker->pause();

    pcmQueue_->clear();

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
    clock_->seekToSeconds(seconds, seekRate);

    bool ok = worker->seek(seconds);

    worker->resume();

    return ok;
}

// =====================================================
// AUDIO RENDER (REALTIME CRITICAL)
// =====================================================

size_t PlaybackController::render(float* output,
                                uint32_t frames,
                                uint32_t channels,
                                uint32_t sampleRate) noexcept {
    if (!output || frames == 0) return 0;

    // Laju stream datang dari pemilik stream (AudioEngine). Disimpan supaya
    // startDecoder() bisa memakai laju yang BENAR sebagai target resample,
    // bukan default 48000.
    if (sampleRate >= 8000 && sampleRate <= 768000) {
        setStreamSampleRate(sampleRate);
    }

    const size_t requestedSamples =
        static_cast<size_t>(frames) * channels;

    // 🔥 RACE FIX
    if (clearing_.load(std::memory_order_acquire)) {
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
    // menghentikan producer (decoder), queue 60–90% penuh (~13–20 dtk)
    // tetap mengalir ke speaker. Audio terus jalan belasan detik setelah
    // pause ditekan.
    //
    // Sekarang: isi buffer dengan senyap dan laporkan penuh (p-m14 — buffer
    // memang terisi, jadi bukan underrun). Clock sudah di-gate playing_
    // sejak 2026-10-10, jadi posisi berhenti; decoder juga tidak di-resume
    // saat paused (cek di bawah).
    if (!playing_.load(std::memory_order_acquire)) {
        std::fill(output, output + requestedSamples, 0.0f);
        return requestedSamples;
    }

    const size_t readSamples =
        pcmQueue_->read(output, requestedSamples);

    // 🔥 FIX 2: resume decoder kalau queue 60% (naik dari 30%)
    //
    // FIX (2026-10-06): resume lebih cepat supaya decoder mulai isi sebelum
    // queue benar-benar lapar. 30% (6.5 detik) terlalu lama untuk file hi-res
    // yang butuh 2x throughput — saat akhirnya resume, queue sudah hampir
    // kosong dan underrun tidak bisa dihindari.
    //
    // 🔥 FIX (2026-10-09, crash auto-advance): render() jalan di AUDIO THREAD
    // dan membaca decoderWorker_ TANPA sinkronisasi. Saat auto-advance EOF,
    // advanceThread (thread biasa) memanggil loadTrack() → stopDecoder() →
    // decoderWorker_.reset() + make_unique. Antara reset() dan make_unique(),
    // decoderWorker_ = nullptr → unique_ptr dibaca dari dua thread bersamaan
    // = data race (TSAN) dan bisa membaca objek setengah-terbangun.
    //
    // Kondisi `clearing_` sudah melindungi wilayah ini untuk pcmQueue_, tapi
    // cek decoderWorker_ tambahan dipindah ke bawah pengecekan clearing_ dan
    // diambil lewat snapshotWorker() (P-M4, 2026-11-10): salinan shared_ptr
    // di bawah lock singkat, dipakai tanpa lock.
    if (pcmQueue_ && !clearing_.load(std::memory_order_acquire)) {
        // Snapshot pointer di bawah lock singkat, lalu pakai salinan TANPA
        // lock (P-M4, 2026-11-10): advanceThread memegang lock yang sama
        // saat stopDecoder(), jadi snapshot tidak pernah melihat pointer
        // setengah-reset; objek tetap hidup lewat shared ownership.
        if (auto worker = snapshotWorker()) {
            size_t avail = pcmQueue_->availableSamples();
            size_t cap = pcmQueue_->capacitySamples();
            // 🔥 FIX (2026-10-10): JANGAN resume decoder saat user menekan pause.
            //
            // BUG: render() dipanggil tiap ~10ms oleh audio thread. Cek
            // avail < 60% ini untuk menjaga queue terisi — TANPA memeriksa
            // playing_. User menekan pause → pause() memanggil
            // decoderWorker_->pause() → tapi 10ms kemudian render() melihat
            // queue sudah < 60% (karena drain) → memanggil resume() → decoder
            // balai mengisi lagi → audio TIDAK PERNAH berhenti.
            //
            // Bukti dari log 2026-10-10_02-06-52: 2x "pause() called",
            // tapi system MediaSession 657x state=PLAYING(3), 0x state=PAUSED.
            // Audio terus jalan, posisi terus merangkak naik (4136→5160→6168).
            if (avail < cap * 60 / 100 && playing_.load(std::memory_order_acquire)) {
                worker->resume();
            }
        }
    }

    // 🔥 SAFETY NET: cleanup NaN/Inf di render (untuk sisa race boundary)
    {
        int nanCount = 0;
        for (size_t i = 0; i < readSamples; ++i) {
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
        static int totalNan = 0;
        totalNan += nanCount;
        if (nanCount > 0) {
            __android_log_print(ANDROID_LOG_WARN, "PlaybackController",
                "render: cleaned %d NaN samples (total=%d)",
                nanCount, totalNan);
        }
    }

    // 🔥 SPAM CONTROL: log hanya tiap 5000 render
    static int renderCount = 0;
    renderCount++;
    if (renderCount % 5000 == 0) {
        __android_log_print(ANDROID_LOG_INFO, "PlaybackController",
                            "render readSamples=%zu/%zu (frames=%u ch=%u)",
                            readSamples, requestedSamples, frames, channels);
    }
    // (Blok debug min/max/mean per 100 callback dihapus 2026-11-10 (M5):
    // satu pass penuh atas buffer + log di audio thread — debug yang
    // ketinggalan, bukan metrik.)
    if (readSamples < requestedSamples) {
        std::fill(
            output + readSamples,
            output + requestedSamples,
            0.0f
        );
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
    const uint32_t ch = (channels > 0) ? channels : 1;
    const uint32_t advancedFrames = static_cast<uint32_t>(readSamples) / ch;
    if (advancedFrames > 0 && playing_.load(std::memory_order_acquire)) {
        clock_->advanceFrames(advancedFrames);
    }

    // 🔥 FIX: sync position & duration ke state (untuk JS getPosition)
    if (state_ && clock_ && sampleRate > 0) {
        uint64_t framesPos = clock_->positionFrames();
        uint64_t msPos = (framesPos * 1000ULL) / sampleRate;
        state_->setPosition(msPos);

        // BUG (2026-10-06): clock_->durationFrames() TIDAK PERNAH di-set
        // (setDurationFrames tak punya pemanggil), jadi blok ini no-op dan
        // duration state hanya berasal dari track.durationMs di loadTrack.
        // Karena framesDur==0 di-skip, tidak ada yang ditimpa — aman, tapi
        // tidak ada cross-check. Saat decoder membuka file hi-res, track
        // duration dari MediaMetadataRetriever bisa 0 → UI durasi 0:00.
        // Pakai durasi decoder bila tersedia.
        uint64_t framesDur = clock_->durationFrames();
        if (framesDur > 0) {
            uint64_t msDur = (framesDur * 1000ULL) / sampleRate;
            state_->setDuration(msDur);
        }
        else {
            // 🔥 FIX (2026-11-10, p-m21 + P-M4): baca lewat snapshot, bukan
            // `else if (decoderWorker_)` tanpa lock. Dulu pemakaian aman
            // karena re-check di bawah lock, tapi balapan bacaannya tersisa.
            if (auto worker = snapshotWorker()) {
                const double decDur = worker->getDuration();
                if (decDur > 0.0) {
                    state_->setDuration(
                        static_cast<uint64_t>(decDur * 1000.0)
                    );
                }
            }
        }
    }

    if (metrics_) {
        metrics_->recordFrameRendered(frames);
    }

    // Jumlah sample yang benar-benar dibaca — AudioCallback memakainya
    // untuk metrik underrun (M5, 2026-11-10). Sisa buffer (kalau ada)
    // sudah diisi senyap di atas.
    return readSamples;
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
        const uint32_t rate = streamSampleRate();
        if (rate >= 8000 && rate <= 768000) {
            cfg.targetSampleRate = rate;
        }

        // 🔥 FIX (2026-10-06, "96kHz masih cacat"): chunkFrames skalakan dengan
        // rasio downsample. decode(maxFrames) berhenti saat OUTPUT mencapai
        // maxFrames, tapi FLAC 96kHz hanya menghasilkan ~1152 output per frame
        // input — decoder harus baca 2x lebih banyak packet untuk jumlah output
        // yang sama. Dengan chunk 4096, throughput loop turun di bawah realtime
        // (11 loop/s x 2238 = 24.8k fps < 48k butuh) → PCMQueue underrun →
        // NaN + garbage 1e32 di render (13.733 sample total, pola 26 tiap 170ms).
        //
        // chunkFrames = 4096 * max(1, round(inRate / outRate)) dibulatkan ke
        // kelipatan 4096, supaya decode() tetap menghasilkan >= 4096 output
        // frames per loop berapa pun rasio file.
        if (cfg.targetSampleRate > 0) {
            uint32_t ratio = 1;
            // Rasio dari rate stream ke rate output — dibulatkan ke atas.
            // Decoder akan baca rate file asli setelah open(), tapi kita tidak
            // tahu rate file di sini. Pakai chunk besar untuk semua file
            // hi-res aman: decoder break sendiri saat output >= maxFrames.
            (void)ratio;
            cfg.chunkFrames = 4096 * 4;  // 16384 — cukup untuk 4:1 downsample
        }
        __android_log_print(ANDROID_LOG_INFO, "PlaybackController",
            "startDecoder: targetSampleRate=%u (stream=%u) chunkFrames=%u",
            cfg.targetSampleRate, rate, cfg.chunkFrames);

        // Worker lokal dulu (M3): dipublikasikan ke decoderWorker_ hanya
        // setelah start() berhasil, di bawah lock.
        auto worker = std::make_shared<decoder::DecoderWorker>(
            std::make_unique<decoder::FFmpegDecoder>(cfg)
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
        worker->setEofCallback([this]() {
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
            scheduleAdvance(uri);
        });

        // 🔥 FIX (2026-11-10, P-M4): callback menangkap weak_ptr ke worker
        // yang memilikinya, BUKAN membaca decoderWorker_ (member). Cabang
        // backpressure ini jalan di thread decoder di bawah decodeMutex_;
        // membaca member tanpa lock di sini adalah TOCTOU yang sama seperti
        // di play()/pause()/seek(). weak_ptr memastikan pause() hanya
        // menyasar worker yang benar-benar memproduksi data ini — kalau
        // worker sudah diganti loadTrack, lock() gagal dan cabang dilewati
        // (queue baru saja di-clear loadTrack, jadi tidak ada yang perlu
        // di-pause).
        worker->setDecodeCallback(
            [this, weakWorker = std::weak_ptr<decoder::DecoderWorker>(worker)](
                decoder::DecodeResult&& result) {
                if (pcmQueue_ && !result.samples.empty()) {
                    size_t written = pcmQueue_->write(
                        result.samples.data(),
                        result.samples.size()
                    );

                    // 🔥 FIX 1: detect data drop (silent overflow)
                    if (written < result.samples.size()) {
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
                    size_t avail = pcmQueue_->availableSamples();
                    size_t cap = pcmQueue_->capacitySamples();
                    if (avail > cap * 90 / 100) {
                        if (auto w = weakWorker.lock()) {
                            if (!w->isPaused()) {
                                w->pause();
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
    // jadi resume() dari render() yang sudah terlanjur masuk tidak pernah
    // use-after-free — dan resume() sendiri hanya atomic store + notify,
    // aman dipanggil bersamaan dengan stop().
    std::shared_ptr<decoder::DecoderWorker> worker;
    {
        std::lock_guard<std::recursive_mutex> lock(decoderMutex_);
        worker = decoderWorker_;
        decoderWorker_.reset();
    }

    if (worker) {
        worker->stop();
    }
}

// 🔥 Advance queue + loadTrack setelah EOF, di thread terpisah.
//
// EOF callback jalan di thread decoder. Kalau loadTrack() dipanggil di sana,
// stopDecoder() akan join thread yang sedang berjalan → deadlock, dan
// decoderWorker_.reset() menghancurkan object dari dalam dirinya sendiri
// → use-after-free. Thread baru memutus dependensi ini.
//
// advanceThread_ di-join di shutdown() (destructor) — dan di stop() (P-M3)
// supaya tidak bocor dan tidak menghidupkan lagi audio setelah stop.
void PlaybackController::scheduleAdvance(const std::string& finishedUri) {
    if (advanceThread_.joinable()) {
        advanceThread_.join();
    }

    // Advance baru = pembatalan sebelumnya tidak berlaku lagi.
    advanceCancelled_.store(false, std::memory_order_release);

    advanceThread_ = std::thread([this, finishedUri]() {
        if (!queue_) return;

        // 🔥 FIX (2026-11-10, P-M1): TUNGGU ekor track habis dimainkan dulu.
        //
        // Sebelumnya scheduleAdvance langsung loadTrack → pcmQueue_->clear()
        // membuang audio yang sudah di-decode tapi belum dimainkan. Decoder
        // jalan 13–20 dtk di depan playback (queue 21,8 dtk, pause 90% /
        // resume 60%), jadi tiap auto-advance memotong ekor sepanjang itu.
        //
        // Sekarang: decoder sudah selesai (EOF), tidak ada lagi yang mengisi
        // queue — available hanya berkurang lewat render(). Tunggu sampai
        // queue kosong, atau sampai dibatalkan (stop/loadTrack/shutdown).
        // Kalau user pause di tengah ekor, drain berhenti (render tidak
        // menarik saat paused, P-M2) dan thread ini menunggu sampai resume
        // atau batal — ekor tidak hilang.
        while (true) {
            if (advanceCancelled_.load(std::memory_order_acquire)) {
                __android_log_print(ANDROID_LOG_INFO, "PlaybackController",
                    "scheduleAdvance: dibatalkan saat menunggu drain");
                return;
            }
            if (!pcmQueue_) return;
            if (pcmQueue_->availableSamples() == 0) break;
            std::this_thread::sleep_for(std::chrono::milliseconds(20));
        }

        if (advanceCancelled_.load(std::memory_order_acquire)) return;

        if (queue_->advance()) {
            auto nextTrack = queue_->current();
            if (nextTrack) {
                __android_log_print(
                    ANDROID_LOG_INFO, "PlaybackController",
                    "EOF: advancing to next track uri=%s",
                    nextTrack->uri.c_str());
                if (loadTrack(*nextTrack)) {
                    // Ekor track lama SUDAH habis terdengar — sekarang
                    // waktunya JS tahu track itu berakhir.
                    pristine::playback::emitTrackEnded(finishedUri);
                }
            }
        } else {
            __android_log_print(ANDROID_LOG_INFO, "PlaybackController",
                                "EOF: queue exhausted (repeat off)");
            // 🔥 FIX (2026-11-10, p-m4): antrean habis = status Completed,
            // bukan Playing yang membeku di akhir trek. JS polling
            // status === 1 (Playing) jadi tahu playback benar-benar selesai.
            playing_.store(false, std::memory_order_release);
            if (state_) state_->setStatus(PlaybackStatus::Completed);
            pristine::playback::emitTrackEnded(finishedUri);
        }
    });
}

void PlaybackController::cancelPendingAdvance() noexcept {
    advanceCancelled_.store(true, std::memory_order_release);
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

    // 🔥 FIX (2026-11-10, P-M4): salin di bawah lock — currentTrack_ ditulis
    // loadTrack() dari thread lain.
    TrackInfo trackCopy;
    {
        std::lock_guard<std::recursive_mutex> lock(decoderMutex_);
        trackCopy = currentTrack_;
    }
    state_->setCurrentTrack(trackCopy);
}

} // namespace pristine::playback 