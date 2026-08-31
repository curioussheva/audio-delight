#include "PlaybackController.h"

#include "../decoder/FFmpegDecoder.h"

#include <algorithm>

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

    pcmQueue_ = std::make_shared<PCMQueue>(48000 * 10); // ~10 sec buffer
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
    if (!initialized_.load(std::memory_order_acquire))
        return false;

    stopDecoder();

    currentTrack_ = track;

    pcmQueue_->clear();
    clock_->reset();

    return startDecoder(track);
}

bool PlaybackController::play() {
    if (!initialized_.load(std::memory_order_acquire))
        return false;

    playing_.store(true, std::memory_order_release);

    if (decoderWorker_) {
        decoderWorker_->resume();
    }

    return true;
}

bool PlaybackController::pause() {
    playing_.store(false, std::memory_order_release);

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

    const size_t requested = frames * channels;
    size_t readFrames = pcmQueue_->read(output, frames);

    if (readFrames < frames) {
        const size_t offset = readFrames * channels;
        const size_t remaining = (frames - readFrames) * channels;
        std::fill(output + offset, output + offset + remaining, 0.0f);
    }

    clock_->advanceFrames(frames);

    if (metrics_) {
        metrics_->recordFrameRendered(frames);
    }
}

// =====================================================
// DECODER CONTROL
// =====================================================

bool PlaybackController::startDecoder(const TrackInfo& track) {
    try {
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

        return decoderWorker_->start(track.uri, 0.0);
    }
    catch (...) {
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