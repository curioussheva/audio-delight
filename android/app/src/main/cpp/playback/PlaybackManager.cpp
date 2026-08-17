#include "PlaybackManager.h"

namespace pristine::playback {

PlaybackManager::PlaybackManager()
    :
    controller_(
        std::make_unique<
            PlaybackController>()
    ),

    queue_(
        std::make_unique<
            TrackQueue>()
    ),

    scheduler_(
        std::make_unique<
            PlaybackScheduler>()
    ),

    events_(
        std::make_shared<
            PlaybackEventDispatcher>()
    ) {

}

PlaybackManager::~PlaybackManager() {

    shutdown();
}

bool PlaybackManager::initialize() {

    if (
        initialized_.exchange(true)
    ) {
        return true;
    }

    return controller_->initialize();
}

void PlaybackManager::shutdown() {

    if (
        !initialized_.exchange(false)
    ) {
        return;
    }

    controller_->shutdown();
}

bool PlaybackManager::isInitialized() const noexcept {

    return initialized_.load(
        std::memory_order_acquire
    );
}

bool PlaybackManager::play() {

    if (
        queue_->isEmpty()
    ) {
        return false;
    }

    if (
        !loadCurrentTrack()
    ) {
        return false;
    }

    return controller_->play();
}

bool PlaybackManager::pause() {

    return controller_->pause();
}

bool PlaybackManager::stop() {

    return controller_->stop();
}

bool PlaybackManager::seek(
    double seconds
) {

    return controller_->seek(
        seconds
    );
}

bool PlaybackManager::next() {

    if (
        !queue_->advance()
    ) {
        return false;
    }

    return transitionToNextTrack();
}

bool PlaybackManager::previous() {

    if (
        !queue_->retreat()
    ) {
        return false;
    }

    return transitionToNextTrack();
}

bool PlaybackManager::skipTo(
    size_t index
) {

    if (
        !queue_->jumpTo(index)
    ) {
        return false;
    }

    return transitionToNextTrack();
}

void PlaybackManager::setQueue(
    const std::vector<TrackInfo>& tracks
) {

    queue_->setTracks(
        tracks
    );
}

void PlaybackManager::addTrack(
    const TrackInfo& track
) {

    queue_->appendTrack(
        track
    );
}

void PlaybackManager::removeTrack(
    size_t index
) {

    queue_->removeTrack(
        index
    );
}

void PlaybackManager::clearQueue() {

    queue_->clear();
}

std::vector<TrackInfo>
PlaybackManager::queue() const {

    return queue_->tracks();
}

void PlaybackManager::setRepeatMode(
    RepeatMode mode
) {

    repeatMode_ = mode;
}

void PlaybackManager::setShuffleMode(
    ShuffleMode mode
) {

    shuffleMode_ = mode;

    queue_->setShuffleMode(
        mode
    );
}

RepeatMode
PlaybackManager::repeatMode() const {

    return repeatMode_;
}

ShuffleMode
PlaybackManager::shuffleMode() const {

    return shuffleMode_;
}

PlaybackSnapshot
PlaybackManager::snapshot() const {

    return controller_
        ->state()
        ->snapshot();
}

PlaybackMetrics
PlaybackManager::metrics() const {

    return controller_
        ->metrics()
        ->snapshot();
}

void PlaybackManager::addListener(
    PlaybackEventListener* listener
) {

    events_->addListener(
        listener
    );
}

void PlaybackManager::removeListener(
    PlaybackEventListener* listener
) {

    events_->removeListener(
        listener
    );
}

bool PlaybackManager::loadCurrentTrack() {

    auto track =
        queue_->current();

    if (!track) {
        return false;
    }

    return controller_->loadTrack(
        *track
    );
}

bool PlaybackManager::transitionToNextTrack() {

    if (
        !loadCurrentTrack()
    ) {
        return false;
    }

    return controller_->play();
}

} // namespace pristine::playback 