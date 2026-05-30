#pragma once

#include "../BiquadFilter.h"

namespace pristine {

class ToneControl {
public:

    void prepare(
        float sampleRate
    ) {

        mSampleRate = sampleRate;
    }

    void setBass(
        float gainDb
    ) {

        mBass.setLowShelf(
            120.0f,
            0.707f,
            gainDb,
            mSampleRate
        );
    }

    void setTreble(
        float gainDb
    ) {

        mTreble.setHighShelf(
            8000.0f,
            0.707f,
            gainDb,
            mSampleRate
        );
    }

    inline float process(
        float input
    ) {

        input =
            mBass.process(input);

        input =
            mTreble.process(input);

        return input;
    }

    void reset() {

        mBass.reset();
        mTreble.reset();
    }

private:

    float mSampleRate = 48000.0f;

    BiquadFilter mBass;
    BiquadFilter mTreble;
};

} // namespace pristine