#pragma once

#include "PlaybackTypes.h"

#include <atomic>
#include <mutex>
#include <optional>

namespace pristine::playback {

// =====================================================
// IMMUTABLE SNAPSHOT
// =====================================================

struct PlaybackSnapshot {

    PlaybackStatus status =
        PlaybackStatus::Stopped;

    PlaybackPosition position;

    RepeatMode repeat =
        RepeatMode::Off;

    ShuffleMode shuffle =
        ShuffleMode::Off;

    std::optional<TrackInfo>
        currentTrack;

    size_t queueIndex = 0;

    size_t queueLength = 0;

    bool isBuffering = false;

    float playbackRate = 1.0f;
};

// =====================================================
// THREAD SAFE PLAYBACK STATE
// =====================================================

class PlaybackState {
public:

    PlaybackState() = default;

    ~PlaybackState() = default;

    PlaybackState(
        const PlaybackState&
    ) = delete;

    PlaybackState& operator=(
        const PlaybackState&
    ) = delete;

    PlaybackState(
        PlaybackState&&
    ) = default;

    PlaybackState& operator=(
        PlaybackState&&
    ) = default;

    // =====================================
    // STATUS
    // =====================================

    [[nodiscard]]
    PlaybackStatus
    getStatus() const noexcept {

        return status_.load(
            std::memory_order_acquire
        );
    }

    void setStatus(
        PlaybackStatus status
    ) noexcept {

        status_.store(
            status,
            std::memory_order_release
        );
    }

    // =====================================
    // POSITION
    // =====================================

    [[nodiscard]]
    PlaybackPosition
    getPosition() const noexcept {

        PlaybackPosition pos;

        pos.positionMs =
            positionMs_.load(
                std::memory_order_acquire
            );

        pos.durationMs =
            durationMs_.load(
                std::memory_order_acquire
            );

        return pos;
    }

    void setPosition(
        uint64_t positionMs
    ) noexcept {

        positionMs_.store(
            positionMs,
            std::memory_order_release
        );
    }

    void setDuration(
        uint64_t durationMs
    ) noexcept {

        durationMs_.store(
            durationMs,
            std::memory_order_release
        );
    }

    // =====================================
    // REPEAT
    // =====================================

    [[nodiscard]]
    RepeatMode
    getRepeatMode() const noexcept {

        return repeat_.load(
            std::memory_order_acquire
        );
    }

    void setRepeatMode(
        RepeatMode mode
    ) noexcept {

        repeat_.store(
            mode,
            std::memory_order_release
        );
    }

    // =====================================
    // SHUFFLE
    // =====================================

    [[nodiscard]]
    ShuffleMode
    getShuffleMode() const noexcept {

        return shuffle_.load(
            std::memory_order_acquire
        );
    }

    void setShuffleMode(
        ShuffleMode mode
    ) noexcept {

        shuffle_.store(
            mode,
            std::memory_order_release
        );
    }

    // =====================================
    // BUFFERING
    // =====================================

    [[nodiscard]]
    bool isBuffering() const noexcept {

        return buffering_.load(
            std::memory_order_acquire
        );
    }

    void setBuffering(
        bool buffering
    ) noexcept {

        buffering_.store(
            buffering,
            std::memory_order_release
        );
    }

    // =====================================
    // PLAYBACK RATE
    // =====================================

    [[nodiscard]]
    float getPlaybackRate()
    const noexcept {

        return rate_.load(
            std::memory_order_acquire
        );
    }

    void setPlaybackRate(
        float rate
    ) noexcept {

        rate_.store(
            rate,
            std::memory_order_release
        );
    }

    // =====================================
    // TRACK
    // =====================================

    void setCurrentTrack(
        const TrackInfo& track
    ) {

        std::lock_guard<std::mutex>
            lock(trackMutex_);

        currentTrack_ = track;
    }

    void clearCurrentTrack() {

        std::lock_guard<std::mutex>
            lock(trackMutex_);

        currentTrack_.reset();
    }

    [[nodiscard]]
    std::optional<TrackInfo>
    getCurrentTrack() const {

        std::lock_guard<std::mutex>
            lock(trackMutex_);

        return currentTrack_;
    }

    // =====================================
    // QUEUE
    // =====================================

    void setQueueInfo(
        size_t index,
        size_t length
    ) noexcept {

        queueIndex_.store(
            index,
            std::memory_order_release
        );

        queueLength_.store(
            length,
            std::memory_order_release
        );
    }

    // =====================================
    // SNAPSHOT
    // =====================================

    [[nodiscard]]
    PlaybackSnapshot
    snapshot() const {

        PlaybackSnapshot snap;

        snap.status =
            getStatus();

        snap.position =
            getPosition();

        snap.repeat =
            getRepeatMode();

        snap.shuffle =
            getShuffleMode();

        snap.isBuffering =
            isBuffering();

        snap.playbackRate =
            getPlaybackRate();

        snap.queueIndex =
            queueIndex_.load(
                std::memory_order_acquire
            );

        snap.queueLength =
            queueLength_.load(
                std::memory_order_acquire
            );

        {
            std::lock_guard<std::mutex>
                lock(trackMutex_);

            snap.currentTrack =
                currentTrack_;
        }

        return snap;
    }

private:

    // Playback status

    std::atomic<PlaybackStatus>
        status_{
            PlaybackStatus::Stopped
        };

    // Position

    std::atomic<uint64_t>
        positionMs_{0};

    std::atomic<uint64_t>
        durationMs_{0};

    // Playback modes

    std::atomic<RepeatMode>
        repeat_{
            RepeatMode::Off
        };

    std::atomic<ShuffleMode>
        shuffle_{
            ShuffleMode::Off
        };

    // Runtime state

    std::atomic<bool>
        buffering_{false};

    std::atomic<float>
        rate_{1.0f};

    // Queue state

    std::atomic<size_t>
        queueIndex_{0};

    std::atomic<size_t>
        queueLength_{0};

    // Track metadata

    mutable std::mutex
        trackMutex_;

    std::optional<TrackInfo>
        currentTrack_;
};

} // namespace pristine::playback 