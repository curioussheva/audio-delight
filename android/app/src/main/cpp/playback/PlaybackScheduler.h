#pragma once

#include "SchedulerTypes.h"
#include "../playback/PlaybackState.h"
#include "../playback/TrackQueue.h"
#include "../playback/PlaybackEvents.h"

#include <memory>
#include <atomic>

namespace pristine::playback {

class PlaybackScheduler {
public:
    PlaybackScheduler(
        std::shared_ptr<PlaybackState> state,
        std::shared_ptr<TrackQueue> queue,
        std::shared_ptr<PlaybackEventDispatcher> events
    );

    ~PlaybackScheduler() = default;

    void initialize(const TransitionConfig& config);
    void shutdown();

    // called from audio/controller thread
    void update(uint64_t currentFrame, uint64_t totalFrames);

    void notifyTrackLoaded(uint64_t totalFrames);
    void notifyTrackFinished();
    void triggerManualNext();

    [[nodiscard]] SchedulerState state() const noexcept;
    [[nodiscard]] bool isTransitionPending() const noexcept;

private:
    void evaluatePrebuffer(uint64_t current, uint64_t total);
    void evaluateTransition(uint64_t current, uint64_t total);

    void requestPrebuffer();
    void requestTransition(bool manual, uint64_t current);

private:
    std::shared_ptr<PlaybackState> state_;
    std::shared_ptr<TrackQueue> queue_;
    std::shared_ptr<PlaybackEventDispatcher> events_;

    TransitionConfig config_;

    std::atomic<SchedulerState> state_{SchedulerState::Idle};
    std::atomic<bool> transitionPending_{false};
    std::atomic<bool> prebufferPending_{false};

    std::atomic<uint64_t> lastFrame_{0};
    std::atomic<uint64_t> lastTotal_{0};
};

} 