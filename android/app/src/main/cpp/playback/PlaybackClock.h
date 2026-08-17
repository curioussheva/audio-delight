#pragma once

#include <atomic>
#include <cstdint>

namespace pristine::playback {

class PlaybackClock {
public:
    PlaybackClock() = default;

    // Audio thread
    void advanceFrames(uint32_t frames) noexcept;

    // Seek
    void seekToFrame(uint64_t frame) noexcept;
    void seekToSeconds(double seconds, uint32_t sampleRate) noexcept;

    // Position (atomic snapshot safe)
    [[nodiscard]] uint64_t positionFrames() const noexcept;
    [[nodiscard]] double positionSeconds(uint32_t sampleRate) const noexcept;

    // Duration
    void setDurationFrames(uint64_t frames) noexcept;
    [[nodiscard]] uint64_t durationFrames() const noexcept;
    [[nodiscard]] double durationSeconds(uint32_t sampleRate) const noexcept;

    // Progress (snapshot consistent)
    [[nodiscard]] double progress() const noexcept;

    [[nodiscard]] bool isNearEnd(uint64_t thresholdFrames) const noexcept;

    // Stats
    [[nodiscard]] uint64_t totalFramesRendered() const noexcept;

    void reset() noexcept;

private:
    alignas(64) std::atomic<uint64_t> positionFrames_{0};
    alignas(64) std::atomic<uint64_t> durationFrames_{0};
    alignas(64) std::atomic<uint64_t> totalFramesRendered_{0};

private:
    [[nodiscard]] inline uint64_t snapshotPosition() const noexcept;
    [[nodiscard]] inline uint64_t snapshotDuration() const noexcept;
};

} // namespace pristine::playback 