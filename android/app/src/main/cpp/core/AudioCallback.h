// =====================================================
// core/AudioCallback.h
// =====================================================

#pragma once

#include <oboe/Oboe.h>

#include "AudioBufferController.h"
#include "AudioMetrics.h"
#include "AudioPipeline.h"
#include "AudioState.h"
#include "AudioTypes.h"

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

    // =============================================
    // TEMP BUFFERS
    // =============================================

    float mLeft[
        audio::kMaxFramesPerCallback
    ];

    float mRight[
        audio::kMaxFramesPerCallback
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