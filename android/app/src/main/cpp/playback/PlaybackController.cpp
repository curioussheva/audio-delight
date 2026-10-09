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
    return decoderWorker_ != nullptr;
}

// =====================================================
// QUEUE & NAVIGATION
// =====================================================

bool PlaybackController::next() {
    if (!queue_) return false;
    auto track = queue_->next();
    if (track) {
        return loadTrack(*track);
    }
    return false;
}

bool PlaybackController::previous() {
    if (!queue_) return false;
    auto track = queue_->previous();
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

    stopDecoder();
    clearing_.store(true, std::memory_order_release);
    std::this_thread::sleep_for(std::chrono::milliseconds(10));

    currentTrack_ = track;

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

    bool result = startDecoder(track);
    clearing_.store(false, std::memory_order_release);
    __android_log_print(ANDROID_LOG_INFO, "PlaybackController",
                        "loadTrack(): DONE startDecoder=%s",
                        result ? "true" : "false");
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

    // 🔥 FIX: load track baru kalau decoder belum ada ATAU track berubah
    // (sebelumnya cuma cek !decoderWorker_, jadi kalau decoder sudah ada
    // dari track sebelumnya, track baru dari queue tidak pernah di-load)
    bool needsLoad = !decoderWorker_ || track->uri != currentTrack_.uri;

    __android_log_print(ANDROID_LOG_INFO, "PlaybackController",
                        "play(): decoderWorker_=%s, needsLoad=%s, uri=%s",
                        decoderWorker_ ? "exists" : "null",
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

    // 🔥 FIX: guard decoderWorker_ null (startDecoder bisa gagal silent)
    if (!decoderWorker_) {
        __android_log_print(ANDROID_LOG_ERROR, "PlaybackController",
                            "play(): FAILED - decoderWorker_ null after needsLoad (uri=%s)",
                            track->uri.c_str());
        return false;
    }

    playing_.store(true, std::memory_order_release);
    updatePlaybackState();  // 🔥 FIX

    if (decoderWorker_) {
        decoderWorker_->resume();
    }

    __android_log_print(ANDROID_LOG_INFO, "PlaybackController",
                        "play(): SUCCESS");
    return true;
} 

bool PlaybackController::pause() {
    playing_.store(false, std::memory_order_release);
    updatePlaybackState();  // 🔥 FIX

    if (decoderWorker_) {
        decoderWorker_->pause();
    }

    return true;
}

bool PlaybackController::stop() {
    playing_.store(false, std::memory_order_release);

    stopDecoder();

    pcmQueue_->clear();
    clock_->reset();
    updatePlaybackState();  // 🔥 FIX

    return true;
}

bool PlaybackController::seek(double seconds) {
    if (!decoderWorker_)
        return false;

    // 🩹 FIX (Prioritas 2): PCMQueue adalah SPSC lock-free ring buffer
    // — HANYA aman diakses oleh 1 producer (decoder thread) + 1
    // consumer (audio callback thread). clear() dari thread ketiga
    // (JNI/seek caller) bisa menyebabkan writeIndex_/readIndex_ desync
    // kalau kebetulan race dengan decoder thread yang masih write().
    // Fix: pause producer dulu supaya tidak ada writer aktif saat clear.
    decoderWorker_->pause();

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

    bool ok = decoderWorker_->seek(seconds);

    decoderWorker_->resume();

    return ok;
}

// =====================================================
// AUDIO RENDER (REALTIME CRITICAL)
// =====================================================

void PlaybackController::render(float* output,
                                uint32_t frames,
                                uint32_t channels,
                                uint32_t sampleRate) noexcept {
    if (!output || frames == 0) return;

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
        return;
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
    // dan membaca decoderWorker_ (unique_ptr) TANPA sinkronisasi. Saat
    // auto-advance EOF, advanceThread (thread biasa) memanggil loadTrack() →
    // stopDecoder() → decoderWorker_.reset() + make_unique. Antara reset()
    // dan make_unique(), decoderWorker_ = nullptr → unique_ptr dibaca dari
    // dua thread bersamaan = data race (TSAN) dan bisa membaca objek
    // setengah-terbangun.
    //
    // Kondisi `clearing_` sudah melindungi wilayah ini untuk pcmQueue_, tapi
    // cek decoderWorker_ tambahan dipindah ke bawah pengecekan clearing_ dan
    // dilindungi lock decoderMutex_ supaya pembacaan unique_ptr aman.
    if (pcmQueue_ && !clearing_.load(std::memory_order_acquire)) {
        // Snapshot pointer di bawah lock. advanceThread memegang lock yang
        // sama saat stopDecoder(), jadi tidak bisa reset di tengah baca.
        std::lock_guard<std::recursive_mutex> decoderLock(decoderMutex_);
        if (decoderWorker_) {
            size_t avail = pcmQueue_->availableFrames();
            size_t cap = pcmQueue_->capacityFrames();
            if (avail < cap * 60 / 100 && decoderWorker_->isPaused()) {
                decoderWorker_->resume();
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
// 🔥 DEBUG: cek nilai min/max/mean sampel
static int renderDebugCount = 0;
renderDebugCount++;
if (renderDebugCount % 100 == 0 && readSamples > 0) {
    float minV = 1e9f, maxV = -1e9f;
    double sumAbs = 0.0;
    for (size_t i = 0; i < readSamples; i++) {
        float v = output[i];
        if (v < minV) minV = v;
        if (v > maxV) maxV = v;
        sumAbs += (v < 0 ? -v : v);
    }
    float meanAbs = static_cast<float>(sumAbs / readSamples);

    __android_log_print(ANDROID_LOG_INFO, "PlaybackController",
        "SAMPLE min=%.4f max=%.4f mean_abs=%.4f (n=%zu)",
        minV, maxV, meanAbs, readSamples);
}
    if (readSamples < requestedSamples) {
        std::fill(
            output + readSamples,
            output + requestedSamples,
            0.0f
        );
    }

    // 🔥 FIX (2026-10-09): clock hanya boleh maju untuk audio nyata.
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
    const uint32_t ch = (channels > 0) ? channels : 1;
    const uint32_t advancedFrames = static_cast<uint32_t>(readSamples) / ch;
    if (advancedFrames > 0) {
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
        else if (decoderWorker_) {
            // 🔥 FIX (2026-10-09): baca di bawah decoderMutex_ — audio thread
            // vs advanceThread yang reset unique_ptr. Lihat decoderMutex_.
            std::lock_guard<std::recursive_mutex> decoderLock(decoderMutex_);
            if (decoderWorker_) {
                const double decDur = decoderWorker_->getDuration();
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
}

// =====================================================
// DECODER CONTROL
// =====================================================

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
        // 🔥 FIX (2026-10-09): sinkron dengan render() (audio thread) yang
        // membaca decoderWorker_. Lihat decoderMutex_ di header.
        std::lock_guard<std::recursive_mutex> lock(decoderMutex_);

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

        decoderWorker_ = std::make_unique<decoder::DecoderWorker>(
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
        decoderWorker_->setEofCallback([this]() {
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
            const std::string uri = currentTrack_.uri;
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

            // Emit ke JS (thread-safe).
            pristine::playback::emitTrackEnded(uri);

            // Advance + loadTrack di thread terpisah — JANGAN di thread ini.
            scheduleAdvance();
        });

        decoderWorker_->setDecodeCallback(
            [this](decoder::DecodeResult&& result) {
                if (pcmQueue_ && !result.samples.empty()) {
                    size_t written = pcmQueue_->write(
                        result.samples.data(),
                        result.samples.size()
                    );

                    // 🔥 FIX 1: detect data drop (silent overflow)
                    if (written < result.samples.size()) {
                        static int dropCount = 0;
                        dropCount++;
                        if (dropCount % 20 == 0) {
                            __android_log_print(ANDROID_LOG_WARN, "PlaybackController",
                                "DATA DROP: wrote %zu/%zu (queue %zu/%zu) [total drops=%d]",
                                written, result.samples.size(),
                                pcmQueue_->availableFrames(),
                                pcmQueue_->capacityFrames(),
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
                    size_t avail = pcmQueue_->availableFrames();
                    size_t cap = pcmQueue_->capacityFrames();
                    if (avail > cap * 90 / 100) {
                        if (decoderWorker_ && !decoderWorker_->isPaused()) {
                            decoderWorker_->pause();
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
        );

        bool ok = decoderWorker_->start(track.uri, 0.0);
        __android_log_print(ANDROID_LOG_INFO, "PlaybackController",
                            "startDecoder(): ok=%d, uri=%s",
                            ok ? 1 : 0, track.uri.c_str());

        if (!ok) {
            // 🔥 FIX: reset decoder on failure
            __android_log_print(ANDROID_LOG_ERROR, "PlaybackController",
                                "startDecoder(): FAILED, resetting decoderWorker_");
            decoderWorker_.reset();
        }

        return ok;
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
    // 🔥 FIX (2026-10-09): ambil lock supaya audio thread (render()) yang
    // membaca decoderWorker_ tidak pernah melihat pointer setengah-reset.
    std::lock_guard<std::recursive_mutex> lock(decoderMutex_);

    if (!decoderWorker_)
        return;

    decoderWorker_->stop();
    decoderWorker_.reset();
}

// 🔥 Advance queue + loadTrack setelah EOF, di thread terpisah.
//
// EOF callback jalan di thread decoder. Kalau loadTrack() dipanggil di sana,
// stopDecoder() akan join thread yang sedang berjalan → deadlock, dan
// decoderWorker_.reset() menghancurkan object dari dalam dirinya sendiri
// → use-after-free. Thread baru memutus dependensi ini.
//
// advanceThread_ di-join di destructor + stopDecoder supaya tidak bocor.
void PlaybackController::scheduleAdvance() {
    if (advanceThread_.joinable()) {
        advanceThread_.join();
    }

    advanceThread_ = std::thread([this]() {
        if (!queue_) return;

        if (queue_->advance()) {
            auto nextTrack = queue_->current();
            if (nextTrack) {
                __android_log_print(
                    ANDROID_LOG_INFO, "PlaybackController",
                    "EOF: advancing to next track uri=%s",
                    nextTrack->uri.c_str());
                loadTrack(*nextTrack);
            }
        } else {
            __android_log_print(ANDROID_LOG_INFO, "PlaybackController",
                                "EOF: queue exhausted (repeat off)");
        }
    });
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

    state_->setCurrentTrack(currentTrack_);
}

} // namespace pristine::playback 