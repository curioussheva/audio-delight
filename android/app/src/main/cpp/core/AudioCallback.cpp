// =====================================================
// core/AudioCallback.cpp
// =====================================================

#include "AudioCallback.h"

#include <algorithm>
#include <cmath>
#include <cstring>

#include "AudioConstants.h"

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
        audio::kMaxFramesPerCallback
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
    // READ BUFFER
    // =============================================

    const uint64_t readFrames =
        mBufferController.readData(
            mLeft,
            mRight,
            static_cast<uint64_t>(
                numFrames
            ),
            mBufferController
                .getReadIndex()
        );

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
        mState.isDSPEnabled.load(
            std::memory_order_acquire
        )
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
    // METRICS
    // =============================================

    mMetrics.updateBufferedSamples(
        mBufferController.getAvailable()
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

    mState.isRunning.store(
        false,
        std::memory_order_release
    );
}

// =====================================================
// UPDATE PARAMETERS
// =====================================================

void AudioCallback::updateParameters() {

    mParams.masterGain =
        mState.masterGain.load(
            std::memory_order_relaxed
        );

    mParams.balance =
        mState.balance.load(
            std::memory_order_relaxed
        );

    mParams.stereoWidth =
        mState.stereoWidth.load(
            std::memory_order_relaxed
        );

    mParams.dspEnabled =
        mState.isDSPEnabled.load(
            std::memory_order_relaxed
        );

    mParams.limiterEnabled =
        mState.isLimiterEnabled.load(
            std::memory_order_relaxed
        );

    mParams.solfeggioFreq =
        mState.solfeggioFreq.load(
            std::memory_order_relaxed
        );

    mParams.brainwaveFreq =
        mState.brainwaveFreq.load(
            std::memory_order_relaxed
        );

    mParams.resonanceIntensity =
        mState.resonanceIntensity.load(
            std::memory_order_relaxed
        );
}

// =====================================================
// ZAP DENORMAL
// =====================================================

inline float AudioCallback::zapDenormal(
    float x
) noexcept {

    return
        (std::fabs(x) <
         audio::kDenormalThreshold)
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