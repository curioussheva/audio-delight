// =====================================================
// core/AudioCallback.cpp
// =====================================================

#include "AudioCallback.h"
#include <algorithm>
#include <cmath>
#include <cstring>
#include "AudioConstants.h"
#include "../playback/PlaybackController.h"

namespace pristine {

// =====================================================
// CONSTRUCTOR
// =====================================================

AudioCallback::AudioCallback(
    AudioBufferController& buffer,
    AudioPipeline& pipeline,
    AudioMetrics& metrics,
    AudioState& state
)
    : mBufferController(buffer),
      mPipeline(pipeline),
      mMetrics(metrics),
      mState(state) {
    std::memset(
        mLeft,
        0,
        sizeof(mLeft)
    );

    std::memset(
        mRight,
        0,
        sizeof(mRight)
    );

    std::memset(
        mScratchInterleaved,
        0,
        sizeof(mScratchInterleaved)
    );
}

// =====================================================
// AUDIO READY
// =====================================================

oboe::DataCallbackResult
AudioCallback::onAudioReady(
    oboe::AudioStream*,
    void* audioData,
    int32_t numFrames
) {
    auto* output =
        static_cast<float*>(
            audioData
        );

    // =============================================
    // SAFETY
    // =============================================

    if (
        numFrames <= 0 ||
        numFrames >
            kMaxFramesPerCallback
    ) {
        std::memset(
            output,
            0,
            sizeof(float) *
                numFrames * 2
        );

        return
            oboe::DataCallbackResult
                ::Continue;
    }

    // =============================================
    // UPDATE DSP PARAMS
    // =============================================

    updateParameters();

    // =============================================
    // READ SOURCE
    // =============================================

    uint64_t readFrames = 0;

    if (
        mPlaybackController &&
        mPlaybackController->isInitialized()
    ) {
        mPlaybackController->render(
            mScratchInterleaved,
            static_cast<uint32_t>(numFrames),
            2,
            static_cast<uint32_t>(mSampleRate)
        );

        for (
            int32_t i = 0;
            i < numFrames;
            ++i
        ) {
            mLeft[i]  = mScratchInterleaved[i * 2];
            mRight[i] = mScratchInterleaved[i * 2 + 1];
        }

        readFrames = static_cast<uint64_t>(numFrames);
    } else {
        readFrames =
            mBufferController.popStereo(
                mLeft,
                mRight,
                static_cast<uint32_t>(
                    numFrames
                )
            );
    }

    // =============================================
    // UNDERRUN
    // =============================================

    if (
        readFrames <
            static_cast<uint64_t>(
                numFrames
            )
    ) {
        mMetrics.recordUnderrun();

        std::fill(
            mLeft + readFrames,
            mLeft + numFrames,
            0.0f
        );

        std::fill(
            mRight + readFrames,
            mRight + numFrames,
            0.0f
        );
    }

    // =============================================
    // DSP PROCESS
    // =============================================

    if (
        mState.isDSPEnabled()
    ) {
        mPipeline.process(
            mLeft,
            mRight,
            numFrames,
            mParams
        );
    }

    // =============================================
    // INTERLEAVE OUTPUT
    // =============================================

    for (
        int32_t i = 0;
        i < numFrames;
        ++i
    ) {
        float l =
            zapDenormal(
                mLeft[i]
            );

        float r =
            zapDenormal(
                mRight[i]
            );

        l = softClip(l);
        r = softClip(r);

        output[i * 2]     = l;
        output[i * 2 + 1] = r;
    }

    // =============================================
    // VISUALIZER
    // =============================================

    mVisualizer.write(
        mLeft,
        mRight,
        numFrames
    );

    // =============================================
    // METRICS
    // =============================================

    mMetrics.updateBufferedSamples(
        mBufferController.availableFrames()
    );

    return
        oboe::DataCallbackResult
            ::Continue;
}

// =====================================================
// ERROR AFTER CLOSE
// =====================================================

void AudioCallback::onErrorAfterClose(
    oboe::AudioStream*,
    oboe::Result
) {
    mState.setRunning(false);
}

// =====================================================
// UPDATE PARAMETERS
// =====================================================

void AudioCallback::updateParameters() {
    mParams.masterGain = mState.masterGain();
    mParams.balance = mState.balance();
    mParams.stereoWidth = mState.stereoWidth();
    mParams.dspEnabled = mState.isDSPEnabled();
    mParams.limiterEnabled = mState.isLimiterEnabled();
    mParams.solfeggioFreq = mState.solfeggioFreq();
    mParams.brainwaveFreq = mState.brainwaveFreq();
    mParams.resonanceIntensity = mState.resonanceIntensity();
    mParams.processingMode = mState.processingMode();
}

// =====================================================
// ZAP DENORMAL
// =====================================================

inline float AudioCallback::zapDenormal(
    float x
) noexcept {
    return
        (std::fabs(x) <
            kDenormalThreshold)
            ? 0.0f
            : x;
}

// =====================================================
// SOFT CLIP
// =====================================================

inline float AudioCallback::softClip(
    float x
) noexcept {
    return
        x /
        (
            1.0f +
            std::fabs(x)
        );
}

} // namespace pristine 