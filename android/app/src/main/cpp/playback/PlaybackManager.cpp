#include "PlaybackManager.h"

#include "../core/AudioEngine.h"

namespace pristine {

// =====================================
// SINGLETON
// =====================================

PlaybackManager&
PlaybackManager::get() {

    static PlaybackManager instance;
    return instance;
}

// =====================================
// INITIALIZE
// =====================================

void PlaybackManager::initialize(
    AudioEngine* engine
) {

    std::lock_guard<std::mutex>
        lock(mMutex);

    mController.setAudioEngine(
        engine
    );
}

// =====================================
// TRANSPORT
// =====================================

void PlaybackManager::play() {

    mController.play();
}

void PlaybackManager::pause() {

    mController.pause();
}

void PlaybackManager::stop() {

    mController.stop();
}

void PlaybackManager::seekTo(
    uint64_t positionMs
) {

    mController.seekTo(
        positionMs
    );
}

void PlaybackManager::next() {

    // TODO:
    // delegated to JS/RNTP queue
}

void PlaybackManager::previous() {

    // TODO:
    // delegated to JS/RNTP queue
}

// =====================================
// TRACK
// =====================================

void PlaybackManager::prepareTrack(
    const TrackMetadata& metadata
) {

    mController.prepareNewTrack(
        metadata
    );
}

// =====================================
// AUDIO FEED
// =====================================

void PlaybackManager::pushAudioData(
    const float* data,
    int32_t numSamples
) {

    mController.pushAudioData(
        data,
        numSamples
    );
}

// =====================================
// STATE
// =====================================

const PlaybackState&
PlaybackManager::getState() const {

    return mController.getState();
}

} // namespace pristine