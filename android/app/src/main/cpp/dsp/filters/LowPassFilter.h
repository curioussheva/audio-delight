#pragma once

#include "../BiquadFilter.h"

namespace pristine {

class LowPassFilter {
public:

    void prepare(
        float sampleRate
    ) {

        mSampleRate = sampleRate;
    }

    void setCutoff(
        float cutoff
    ) {

        mFilter.setLowPass(
            cutoff,
            0.707f,
            mSampleRate
        );
    }

    inline float process(
        float input
    ) {

        return mFilter.process(
            input
        );
    }

    void reset() {

        mFilter.reset();
    }

private:

    float mSampleRate = 48000.0f;

    BiquadFilter mFilter;
};

} // namespace pristine