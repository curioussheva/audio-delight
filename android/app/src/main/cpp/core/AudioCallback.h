// =====================================================
// core/AudioCallback.h
// =====================================================

#pragma once

#include <oboe/Oboe.h>
#include "AudioBufferController.h"
#include "AudioConstants.h"
#include "AudioMetrics.h"
#include "AudioPipeline.h"
#include "AudioState.h"
#include "AudioTypes.h"
#include "../visualizer/VisualizerBuffer.h"

namespace pristine::playback {
class PlaybackController;
}

namespace pristine {

// =====================================================
// AUDIO CALLBACK
// Realtime audio thread
// =====================================================

class AudioCallback
    : public oboe::AudioStreamCallback {
public:
    AudioCallback(
        AudioBufferController& buffer,
        AudioPipeline& pipeline,
        AudioMetrics& metrics,
        AudioState& state
    );

    ~AudioCallback() override = default;

    // =============================================
    // OBOE CALLBACK
    // =============================================

    oboe::DataCallbackResult
    onAudioReady(
        oboe::AudioStream* stream,
        void* audioData,
        int32_t numFrames
    ) override;

    void onErrorAfterClose(
        oboe::AudioStream* stream,
        oboe::Result error
    ) override;

    // =============================================
    // PLAYBACK SOURCE
    // =============================================

    void setPlaybackController(
        playback::PlaybackController* controller
    ) noexcept {
        mPlaybackController = controller;
    }

    void setSampleRate(
        int32_t sampleRate
    ) noexcept {
        mSampleRate = sampleRate;
    }

    // =============================================
    // VISUALIZER
    // =============================================

    const VisualizerBuffer&
    visualizerBuffer() const noexcept {
        return mVisualizer;
    }

private:
    // =============================================
    // REFERENCES
    // =============================================

    AudioBufferController&
        mBufferController;

    AudioPipeline&
        mPipeline;

    AudioMetrics&
        mMetrics;

    AudioState&
        mState;

    VisualizerBuffer mVisualizer;

    // =============================================
    // PLAYBACK SOURCE
    // =============================================

    playback::PlaybackController*
        mPlaybackController{nullptr};

    int32_t mSampleRate{kDefaultSampleRate};

    float mScratchInterleaved[
        kMaxFramesPerCallback * 2
    ];

    // =============================================
    // TEMP BUFFERS
    // =============================================

    float mLeft[
        kMaxFramesPerCallback
    ];

    float mRight[
        kMaxFramesPerCallback
    ];

    // =============================================
    // DSP PARAM CACHE
    // =============================================

    DSPParameters mParams;

    // =============================================
    // HELPERS
    // =============================================

    void updateParameters();

    inline float zapDenormal(
        float x
    ) noexcept;

    inline float softClip(
        float x
    ) noexcept;
};

} // namespace pristine 