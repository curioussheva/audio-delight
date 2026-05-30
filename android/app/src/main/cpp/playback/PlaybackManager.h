#pragma once

#include <memory>
#include <mutex>

#include "PlaybackController.h"
#include "PlaybackState.h"

namespace pristine {

class AudioEngine;

class PlaybackManager {
public:

    static PlaybackManager& get();

    void initialize(AudioEngine* engine);

    // =====================================
    // TRANSPORT
    // =====================================

    void play();

    void pause();

    void stop();

    void seekTo(uint64_t positionMs);

    void next();

    void previous();

    // =====================================
    // TRACK
    // =====================================

    void prepareTrack(
        const TrackMetadata& metadata
    );

    // =====================================
    // AUDIO FEED
    // =====================================

    void pushAudioData(
        const float* data,
        int32_t numSamples
    );

    // =====================================
    // STATE
    // =====================================

    const PlaybackState&
    getState() const;

private:

    PlaybackManager() = default;
    ~PlaybackManager() = default;

    PlaybackManager(
        const PlaybackManager&
    ) = delete;

    PlaybackManager& operator=(
        const PlaybackManager&
    ) = delete;

private:

    mutable std::mutex mMutex;

    PlaybackController mController;
};

} // namespace pristine