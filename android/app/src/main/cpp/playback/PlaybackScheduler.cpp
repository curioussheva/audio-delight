#include "PlaybackScheduler.h"

namespace pristine::playback {

PlaybackScheduler::PlaybackScheduler(
    std::shared_ptr<PlaybackState> state,
    std::shared_ptr<TrackQueue> queue,
    std::shared_ptr<PlaybackEventDispatcher> events
)
    : state_(std::move(state))
    , queue_(std::move(queue))
    , events_(std::move(events)) {}

void PlaybackScheduler::initialize(const TransitionConfig& config) {
    config_ = config;

    state_.store(SchedulerState::Idle, std::memory_order_release);
    transitionPending_.store(false);
    prebufferPending_.store(false);
}

void PlaybackScheduler::shutdown() {
    state_.store(SchedulerState::Idle, std::memory_order_release);
    transitionPending_.store(false);
    prebufferPending_.store(false);
}

void PlaybackScheduler::notifyTrackLoaded(uint64_t totalFrames) {
    lastFrame_.store(0);
    lastTotal_.store(totalFrames);

    transitionPending_.store(false);
    prebufferPending_.store(false);

    state_.store(SchedulerState::Monitoring, std::memory_order_release);
}

void PlaybackScheduler::update(uint64_t currentFrame, uint64_t totalFrames) {
    lastFrame_.store(currentFrame, std::memory_order_relaxed);
    lastTotal_.store(totalFrames, std::memory_order_relaxed);

    evaluatePrebuffer(currentFrame, totalFrames);
    evaluateTransition(currentFrame, totalFrames);
}

void PlaybackScheduler::evaluatePrebuffer(uint64_t current, uint64_t total) {
    if (prebufferPending_.load(std::memory_order_relaxed)) return;
    if (!queue_->hasNext()) return;

    if (total <= current) return;

    uint64_t remaining = total - current;

    if (remaining <= config_.prebufferFrames) {
        requestPrebuffer();
    }
}

void PlaybackScheduler::evaluateTransition(uint64_t current, uint64_t total) {
    if (transitionPending_.load(std::memory_order_relaxed)) return;
    if (!queue_->hasNext()) return;

    if (total <= current) return;

    uint64_t remaining = total - current;
    uint64_t threshold = 0;

    switch (config_.mode) {
        case TransitionMode::Crossfade:
            threshold = config_.crossfadeDurationFrames;
            break;
        case TransitionMode::Gapless:
            threshold = 4096;
            break;
        case TransitionMode::Gap:
        case TransitionMode::BitPerfect:
        default:
            return;
    }

    if (remaining <= threshold) {
        requestTransition(false, current);
    }
}

void PlaybackScheduler::requestPrebuffer() {
    prebufferPending_.store(true, std::memory_order_release);
    state_.store(SchedulerState::Prebuffering, std::memory_order_release);

    if (events_) {
        events_->dispatch(PrebufferRequestedEvent{});
    }
}

void PlaybackScheduler::requestTransition(bool manual, uint64_t current) {
    transitionPending_.store(true, std::memory_order_release);
    state_.store(SchedulerState::Transitioning, std::memory_order_release);

    if (!events_) return;

    TransitionRequestedEvent event;
    event.manual = manual;
    event.triggerFrame = current;   // 🔥 added context penting

    events_->dispatch(event);
}

void PlaybackScheduler::notifyTrackFinished() {
    requestTransition(false, lastFrame_.load());
}

void PlaybackScheduler::triggerManualNext() {
    requestTransition(true, lastFrame_.load());
}

SchedulerState PlaybackScheduler::state() const noexcept {
    return state_.load(std::memory_order_acquire);
}

bool PlaybackScheduler::isTransitionPending() const noexcept {
    return transitionPending_.load(std::memory_order_acquire);
}

}