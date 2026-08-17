#include "PlaybackClock.h"

namespace pristine::playback {

// =====================================================
// AUDIO THREAD ADVANCE
// =====================================================

void PlaybackClock::advanceFrames(uint32_t frames) noexcept {

    positionFrames_.fetch_add(frames, std::memory_order_relaxed);
    totalFramesRendered_.fetch_add(frames, std::memory_order_relaxed);
}

// =====================================================
// SEEK
// =====================================================

void PlaybackClock::seekToFrame(uint64_t frame) noexcept {
    positionFrames_.store(frame, std::memory_order_release);
}

void PlaybackClock::seekToSeconds(double seconds, uint32_t sampleRate) noexcept {
    seekToFrame(static_cast<uint64_t>(seconds * sampleRate));
}

// =====================================================
// POSITION
// =====================================================

uint64_t PlaybackClock::positionFrames() const noexcept {
    return positionFrames_.load(std::memory_order_acquire);
}

double PlaybackClock::positionSeconds(uint32_t sampleRate) const noexcept {
    return static_cast<double>(positionFrames()) / sampleRate;
}

// =====================================================
// DURATION
// =====================================================

void PlaybackClock::setDurationFrames(uint64_t frames) noexcept {
    durationFrames_.store(frames, std::memory_order_release);
}

uint64_t PlaybackClock::durationFrames() const noexcept {
    return durationFrames_.load(std::memory_order_acquire);
}

double PlaybackClock::durationSeconds(uint32_t sampleRate) const noexcept {
    return static_cast<double>(durationFrames()) / sampleRate;
}

// =====================================================
// SNAPSHOT SAFE PROGRESS
// =====================================================

uint64_t PlaybackClock::snapshotPosition() const noexcept {
    return positionFrames_.load(std::memory_order_acquire);
}

uint64_t PlaybackClock::snapshotDuration() const noexcept {
    return durationFrames_.load(std::memory_order_acquire);
}

double PlaybackClock::progress() const noexcept {

    const uint64_t pos = snapshotPosition();
    const uint64_t dur = snapshotDuration();

    if (dur == 0) return 0.0;
    return static_cast<double>(pos) / dur;
}

// =====================================================
// END CHECK
// =====================================================

bool PlaybackClock::isNearEnd(uint64_t thresholdFrames) const noexcept {

    const uint64_t pos = positionFrames_.load(std::memory_order_acquire);
    const uint64_t dur = durationFrames_.load(std::memory_order_acquire);

    if (dur <= pos) return true;

    return (dur - pos) <= thresholdFrames;
}

// =====================================================
// STATS
// =====================================================

uint64_t PlaybackClock::totalFramesRendered() const noexcept {
    return totalFramesRendered_.load(std::memory_order_acquire);
}

// =====================================================
// RESET
// =====================================================

void PlaybackClock::reset() noexcept {

    positionFrames_.store(0, std::memory_order_release);
    durationFrames_.store(0, std::memory_order_release);
    totalFramesRendered_.store(0, std::memory_order_release);
}

} // namespace pristine::playback 