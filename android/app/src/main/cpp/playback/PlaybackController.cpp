// =====================================================
// playback/PlaybackController.cpp
// =====================================================

#include "PlaybackController.h"

#include "../core/AudioEngine.h"

#include <android/log.h>

#define LOGD(...) \
__android_log_print( \
    ANDROID_LOG_DEBUG, \
    "PlaybackController", \
    __VA_ARGS__ \
)

namespace pristine {

// =====================================================
// CONSTRUCTOR
// =====================================================

PlaybackController::PlaybackController() = default;

// =====================================================
// DESTRUCTOR
// =====================================================

PlaybackController::~PlaybackController() = default;

// =====================================================
// ENGINE
// =====================================================

void PlaybackController::setAudioEngine(
    AudioEngine* engine
) {

    std::lock_guard<std::mutex>
        lock(mMutex);

    mAudioEngine = engine;
}

// =====================================================
// PUSH AUDIO DATA
// =====================================================

void PlaybackController::pushAudioData(
    const float* data,
    int32_t numSamples
) {

    if (
        !data ||
        numSamples <= 0
    ) {
        return;
    }

    if (
        !mPlaybackActive.load(
            std::memory_order_acquire
        )
    ) {
        return;
    }

    std::lock_guard<std::mutex>
        lock(mMutex);

    if (!mAudioEngine) {
        return;
    }

    mAudioEngine->pushData(
        data,
        numSamples
    );
}

// =====================================================
// PLAY
// =====================================================

void PlaybackController::play() {

    mPlaybackActive.store(
        true,
        std::memory_order_release
    );

    mState.setStatus(
        PlaybackStatus::Playing
    );

    LOGD("Playback started");
}

// =====================================================
// PAUSE
// =====================================================

void PlaybackController::pause() {

    mPlaybackActive.store(
        false,
        std::memory_order_release
    );

    mState.setStatus(
        PlaybackStatus::Paused
    );

    LOGD("Playback paused");
}

// =====================================================
// STOP
// =====================================================

void PlaybackController::stop() {

    mPlaybackActive.store(
        false,
        std::memory_order_release
    );

    flush();

    mState.setPositionSamples(
        0
    );

    mState.setStatus(
        PlaybackStatus::Stopped
    );

    LOGD("Playback stopped");
}

// =====================================================
// FLUSH
// =====================================================

void PlaybackController::flush() {

    std::lock_guard<std::mutex>
        lock(mMutex);

    if (!mAudioEngine) {
        return;
    }

    mAudioEngine->flushBuffers();
}

// =====================================================
// SEEK
// =====================================================

void PlaybackController::seekTo(
    uint64_t
) {

    // =========================================
    // TODO
    // decoder-driven seek
    // =========================================
}

// =====================================================
// PREPARE TRACK
// =====================================================

void PlaybackController::prepareNewTrack(
    const TrackMetadata& metadata
) {

    stop();

    mState.reset();

    mState.setMetadata(
        metadata
    );

    LOGD(
        "Prepared track: %s",
        metadata.title.c_str()
    );
}

// =====================================================
// COMPLETE
// =====================================================

void PlaybackController::onPlaybackComplete() {

    mPlaybackActive.store(
        false,
        std::memory_order_release
    );

    mState.setStatus(
        PlaybackStatus::Completed
    );

    LOGD("Playback completed");
}

// =====================================================
// STATE
// =====================================================

const PlaybackState&
PlaybackController::getState()
const noexcept {

    return mState;
}

bool PlaybackController::isPlaying()
const noexcept {

    return
        mPlaybackActive.load(
            std::memory_order_acquire
        );
}

// =====================================================
// POSITION
// =====================================================

uint64_t
PlaybackController::getPositionSamples()
const noexcept {

    if (!mAudioEngine) {
        return 0;
    }

    return
        mAudioEngine
            ->getRenderedSamples();
}

uint64_t
PlaybackController::getPositionMs()
const noexcept {

    if (!mAudioEngine) {
        return 0;
    }

    const auto samples =
        getPositionSamples();

    const auto sampleRate =
        static_cast<uint64_t>(
            mAudioEngine
                ->getSampleRate()
        );

    if (sampleRate == 0) {
        return 0;
    }

    return
        (samples * 1000ULL)
        / sampleRate;
}

// =====================================================
// UPDATE POSITION
// =====================================================

void PlaybackController::updatePlaybackPosition() {

    mState.setPositionSamples(
        getPositionSamples()
    );
}

} // namespace pristine 