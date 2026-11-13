#include "PlaybackClock.h"

namespace pristine::playback {

// =====================================================
// AUDIO THREAD ADVANCE
// =====================================================

void PlaybackClock::advanceFrames(uint32_t frames) noexcept {

    positionFrames_.fetch_add(frames, std::memory_order_relaxed);
}

// =====================================================
// SEEK
// =====================================================

void PlaybackClock::seekToFrame(uint64_t frame) noexcept {
    positionFrames_.store(frame, std::memory_order_release);
}

void PlaybackClock::seekToSeconds(double seconds, uint32_t sampleRate) noexcept {
    // B11-P2-1: cast double -> uint64_t dari nilai negatif/non-finite
    // adalah UB — clamp ke 0 dulu (NaN tak terjangkau via JNI jlong,
    // tapi negatif terjangkau bila JS kirim ms negatif).
    if (!(seconds > 0.0)) seconds = 0.0;
    seekToFrame(static_cast<uint64_t>(seconds * sampleRate));
}

// =====================================================
// DURATION
// =====================================================

void PlaybackClock::setDurationFrames(uint64_t frames) noexcept {
    durationFrames_.store(frames, std::memory_order_release);
}

// =====================================================
// SNAPSHOT KONSISTEN (p-m17)
// =====================================================

std::pair<uint64_t, uint64_t> PlaybackClock::snapshotPositionAndDuration() const noexcept {
    std::lock_guard<std::mutex> lock(snapshotMutex_);
    return {
        positionFrames_.load(std::memory_order_acquire),
        durationFrames_.load(std::memory_order_acquire)
    };
}

// =====================================================
// RESET
// =====================================================

void PlaybackClock::reset() noexcept {
    // Satu lock supaya pasangan (position, duration) tidak pernah terlihat
    // setengah-terganti oleh snapshotPositionAndDuration() (p-m17).
    std::lock_guard<std::mutex> lock(snapshotMutex_);
    positionFrames_.store(0, std::memory_order_release);
    durationFrames_.store(0, std::memory_order_release);
}

} // namespace pristine::playback
