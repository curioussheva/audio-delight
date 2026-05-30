#pragma once

#include <cstdint>
#include <vector>

namespace pristine::dsp {

// =====================================================
// SIMPLE LINEAR RESAMPLER
// Realtime-safe
// Stereo interleaved float32
// =====================================================

class LinearResampler {
public:

    LinearResampler() = default;
    ~LinearResampler() = default;

    void configure(
        int32_t inputSampleRate,
        int32_t outputSampleRate,
        int32_t channels
    );

    void reset();

    // =========================================
    // Interleaved float32 stereo
    // Returns output frames generated
    // =========================================

    int32_t process(
        const float* input,
        int32_t inputFrames,
        float* output,
        int32_t maxOutputFrames
    );

    int32_t
    getOutputFramesForInput(
        int32_t inputFrames
    ) const;

    int32_t inputRate() const {
        return mInputRate;
    }

    int32_t outputRate() const {
        return mOutputRate;
    }

private:

    int32_t mInputRate = 48000;

    int32_t mOutputRate = 48000;

    int32_t mChannels = 2;

    double mRatio = 1.0;

    double mReadPosition = 0.0;
};

} // namespace pristine::dsp