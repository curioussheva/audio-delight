#include "LinearResampler.h"

#include <algorithm>
#include <cmath>

namespace pristine::dsp {

// =====================================================
// CONFIGURE
// =====================================================

void LinearResampler::configure(
    int32_t inputSampleRate,
    int32_t outputSampleRate,
    int32_t channels
) {

    mInputRate =
        inputSampleRate;

    mOutputRate =
        outputSampleRate;

    mChannels =
        channels;

    mRatio =
        static_cast<double>(
            inputSampleRate
        ) /
        static_cast<double>(
            outputSampleRate
        );

    reset();
}

// =====================================================
// RESET
// =====================================================

void LinearResampler::reset() {

    mReadPosition = 0.0;
}

// =====================================================
// OUTPUT SIZE ESTIMATE
// =====================================================

int32_t
LinearResampler::getOutputFramesForInput(
    int32_t inputFrames
) const {

    return static_cast<int32_t>(
        std::ceil(
            static_cast<double>(
                inputFrames
            ) *
            static_cast<double>(
                mOutputRate
            ) /
            static_cast<double>(
                mInputRate
            )
        )
    );
}

// =====================================================
// PROCESS
// =====================================================

int32_t LinearResampler::process(
    const float* input,
    int32_t inputFrames,
    float* output,
    int32_t maxOutputFrames
) {

    if (
        !input ||
        !output ||
        inputFrames <= 1
    ) {

        return 0;
    }

    int32_t outputFrames = 0;

    while (
        outputFrames <
        maxOutputFrames
    ) {

        const int32_t index =
            static_cast<int32_t>(
                mReadPosition
            );

        if (
            index >=
            inputFrames - 1
        ) {

            break;
        }

        const double frac =
            mReadPosition -
            static_cast<double>(
                index
            );

        for (
            int32_t ch = 0;
            ch < mChannels;
            ++ch
        ) {

            const float s1 =
                input[
                    index *
                    mChannels +
                    ch
                ];

            const float s2 =
                input[
                    (index + 1) *
                    mChannels +
                    ch
                ];

            output[
                outputFrames *
                mChannels +
                ch
            ] =
                static_cast<float>(
                    s1 +
                    (s2 - s1) *
                    frac
                );
        }

        mReadPosition +=
            mRatio;

        ++outputFrames;
    }

    mReadPosition -=
        static_cast<int32_t>(
            mReadPosition
        );

    return outputFrames;
}

} // namespace pristine::dsp