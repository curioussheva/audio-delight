#include "PlaybackController.h"

#include "../decoder/FFmpegDecoder.h"

#include <algorithm>
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
    pcmQueue_ = std::make_shared<PCMQueue>(1 << 19); // 2^19 = 524288 float = ~5.5 sec stereo @ 48kHz
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
    currentTrack_ = track;
    pcmQueue_->clear();
    clock_->reset();

    // 🔥 FIX: set duration dari metadata track
    if (state_ && track.durationMs > 0) {
        state_->setDuration(static_cast<uint64_t>(track.durationMs));
    }

    bool result = startDecoder(track);
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

    __android_log_print(ANDROID_LOG_INFO, "PlaybackController",
                        "play(): decoderWorker_=%s, queue_=%s",
                        decoderWorker_ ? "exists" : "null",
                        queue_ ? "exists" : "null");

    if (!decoderWorker_) {
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

        __android_log_print(ANDROID_LOG_INFO, "PlaybackController",
                            "play(): track uri=%s, calling loadTrack",
                            track->uri.c_str());

        if (!loadTrack(*track)) {
            __android_log_print(ANDROID_LOG_ERROR, "PlaybackController",
                                "play(): FAILED - loadTrack returned false");
            return false;
        }
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

    pcmQueue_->clear();
    clock_->seekToSeconds(seconds, 48000);

    return decoderWorker_->seek(seconds);
}

// =====================================================
// AUDIO RENDER (REALTIME CRITICAL)
// =====================================================

void PlaybackController::render(float* output,
                                uint32_t frames,
                                uint32_t channels,
                                uint32_t sampleRate) noexcept {
    if (!output || frames == 0) return;

    const size_t requestedSamples =
        static_cast<size_t>(frames) * channels;

    const size_t readSamples =
        pcmQueue_->read(output, requestedSamples);

    __android_log_print(ANDROID_LOG_INFO, "PlaybackController",
                        "render readSamples=%zu/%zu (frames=%u ch=%u)",
                        readSamples, requestedSamples, frames, channels);
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

    clock_->advanceFrames(frames);

    // 🔥 FIX: sync position & duration ke state (untuk JS getPosition)
    if (state_ && clock_ && sampleRate > 0) {
        uint64_t framesPos = clock_->positionFrames();
        uint64_t msPos = (framesPos * 1000ULL) / sampleRate;
        state_->setPosition(msPos);

        uint64_t framesDur = clock_->durationFrames();
        if (framesDur > 0) {
            uint64_t msDur = (framesDur * 1000ULL) / sampleRate;
            state_->setDuration(msDur);
        }
    }

    if (metrics_) {
        metrics_->recordFrameRendered(frames);
    }
}

// =====================================================
// DECODER CONTROL
// =====================================================

bool PlaybackController::startDecoder(const TrackInfo& track) {
    try {
        __android_log_print(ANDROID_LOG_INFO, "PlaybackController",
                            "startDecoder(): creating decoder for uri=%s",
                            track.uri.c_str());

        decoderWorker_ = std::make_unique<decoder::DecoderWorker>(
            std::make_unique<decoder::FFmpegDecoder>()
        );

        decoderWorker_->setDecodeCallback(
            [this](decoder::DecodeResult&& result) {
                if (pcmQueue_ && !result.samples.empty()) {
                    pcmQueue_->write(
                        result.samples.data(),
                        result.samples.size()
                    );
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
    if (!decoderWorker_)
        return;

    decoderWorker_->stop();
    decoderWorker_.reset();
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