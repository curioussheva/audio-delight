// =====================================================
// playback/PlaybackController.h
// =====================================================

#pragma once

#include <atomic>
#include <cstdint>
#include <mutex>

#include "PlaybackState.h"

namespace pristine {

class AudioEngine;

// =====================================================
// PLAYBACK CONTROLLER
// =====================================================

class PlaybackController {
public:

    PlaybackController();

    ~PlaybackController();

    // =============================================
    // ENGINE
    // =============================================

    void setAudioEngine(
        AudioEngine* engine
    );

    // =============================================
    // AUDIO FEED
    // =============================================

    void pushAudioData(
        const float* data,
        int32_t numSamples
    );

    // =============================================
    // TRANSPORT
    // =============================================

    void play();

    void pause();

    void stop();

    void flush();

    // decoder-driven seek later
    void seekTo(
        uint64_t positionMs
    );

    // =============================================
    // TRACK
    // =============================================

    void prepareNewTrack(
        const TrackMetadata& metadata
    );

    void onPlaybackComplete();

    // =============================================
    // STATE
    // =============================================

    const PlaybackState&
    getState() const noexcept;

    bool isPlaying() const noexcept;

    // =============================================
    // POSITION
    // =============================================

    uint64_t getPositionSamples()
    const noexcept;

    uint64_t getPositionMs()
    const noexcept;

private:

    void updatePlaybackPosition();

private:

    mutable std::mutex mMutex;

    PlaybackState mState;

    AudioEngine* mAudioEngine =
        nullptr;

    std::atomic<bool>
        mPlaybackActive{false};
};

} // namespace pristine 