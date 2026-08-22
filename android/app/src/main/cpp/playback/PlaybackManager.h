#pragma once

#include <memory>
#include <mutex>
#include <atomic>
#include <vector>

#include "PlaybackTypes.h"
#include "PlaybackState.h"
#include "PlaybackMetrics.h"
#include "PlaybackController.h"
#include "TrackQueue.h"
#include "PlaybackScheduler.h"
#include "PlaybackEvents.h"

namespace pristine::playback {

class PlaybackManager {
public:

    PlaybackManager();

    ~PlaybackManager();

    PlaybackManager(
        const PlaybackManager&
    ) = delete;

    PlaybackManager&
    operator=(
        const PlaybackManager&
    ) = delete;

    // =====================================
    // Lifecycle
    // =====================================

    bool initialize();

    void shutdown();

    [[nodiscard]]
    bool isInitialized() const noexcept;

    // =====================================
    // Playback Control
    // =====================================

    bool play();

    bool pause();

    bool stop();

    bool seek(
        double seconds
    );

    bool next();

    bool previous();

    bool skipTo(
        size_t index
    );

    // =====================================
    // Queue Management
    // =====================================

    void setQueue(
        const std::vector<TrackInfo>& tracks
    );

    void addTrack(
        const TrackInfo& track
    );

    void removeTrack(
        size_t index
    );

    void clearQueue();

    [[nodiscard]]
    std::vector<TrackInfo>
    queue() const;

    // =====================================
    // Playback Options
    // =====================================

    void setRepeatMode(
        RepeatMode mode
    );

    void setShuffleMode(
        ShuffleMode mode
    );

    [[nodiscard]]
    RepeatMode repeatMode() const;

    [[nodiscard]]
    ShuffleMode shuffleMode() const;

    // =====================================
    // State
    // =====================================

    [[nodiscard]]
    PlaybackSnapshot snapshot() const;

    [[nodiscard]]
    PlaybackMetrics metrics() const;

    // =====================================
    // Events
    // =====================================

    void addListener(
        PlaybackEventListener* listener
    );

    void removeListener(
        PlaybackEventListener* listener
    );

private:

    bool loadCurrentTrack();

    bool transitionToNextTrack();

private:

    mutable std::mutex mutex_;

    std::atomic<bool>
        initialized_{false};

    std::unique_ptr<PlaybackController>
        controller_;

    std::shared_ptr<TrackQueue>
        queue_;

    std::shared_ptr<PlaybackEventDispatcher>
        events_;

    std::unique_ptr<PlaybackScheduler>
        scheduler_;

    RepeatMode
        repeatMode_ =
            RepeatMode::Off;

    ShuffleMode
        shuffleMode_ =
            ShuffleMode::Off;
};

} // namespace pristine::playback 