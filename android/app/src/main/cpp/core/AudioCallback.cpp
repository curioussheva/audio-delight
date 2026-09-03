// =====================================================
// core/AudioCallback.cpp
// =====================================================

#include "AudioCallback.h"
#include "AudioConstants.h"
#include "../playback/PlaybackController.h"

#include <algorithm>
#include <cmath>
#include <cstring>
#include <android/log.h>

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

    std::memset(mLeft, 0, sizeof(mLeft));
    std::memset(mRight, 0, sizeof(mRight));
    std::memset(mScratchInterleaved, 0, sizeof(mScratchInterleaved));
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
    auto* output = static_cast<float*>(audioData);

    if (numFrames <= 0 || numFrames > kMaxFramesPerCallback) {
        std::memset(output, 0, sizeof(float) * numFrames * 2);
        return oboe::DataCallbackResult::Continue;
    }

    // =============================================
    // Jika PlaybackController tersedia, gunakan sebagai sumber audio
    // =============================================

    if (mPlaybackController) {
        __android_log_print(ANDROID_LOG_DEBUG, "AudioCallback",
                            "using PlaybackController, frames=%d", (int)numFrames);
        mPlaybackController->render(
            output,
            static_cast<uint32_t>(numFrames),
            2,                // stereo
            mSampleRate       // sample rate dari AudioStreamController
        );
        return oboe::DataCallbackResult::Continue;
    } else {
        __android_log_print(ANDROID_LOG_DEBUG, "AudioCallback",
                            "using AudioBufferController fallback");
    }

    // =============================================
    // FALLBACK: AudioBufferController
    // =============================================

    updateParameters();

    const uint64_t readFrames = mBufferController.popStereo(
        mLeft,
        mRight,
        static_cast<uint32_t>(numFrames)
    );

    if (readFrames < static_cast<uint64_t>(numFrames)) {
        mMetrics.recordUnderrun();

        std::fill(mLeft + readFrames, mLeft + numFrames, 0.0f);
        std::fill(mRight + readFrames, mRight + numFrames, 0.0f);
    }

    if (mState.isDSPEnabled()) {
        mPipeline.process(mLeft, mRight, numFrames, mParams);
    }

    for (int32_t i = 0; i < numFrames; ++i) {
        output[i * 2]     = softClip(zapDenormal(mLeft[i]));
        output[i * 2 + 1] = softClip(zapDenormal(mRight[i]));
    }

    mVisualizer.write(mLeft, mRight, numFrames);
    mMetrics.updateBufferedSamples(mBufferController.availableFrames());

    return oboe::DataCallbackResult::Continue;
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

inline float AudioCallback::zapDenormal(float x) noexcept {
    return (std::fabs(x) < kDenormalThreshold) ? 0.0f : x;
}

// =====================================================
// SOFT CLIP
// =====================================================

inline float AudioCallback::softClip(float x) noexcept {
    return x / (1.0f + std::fabs(x));
}

} // namespace pristine 