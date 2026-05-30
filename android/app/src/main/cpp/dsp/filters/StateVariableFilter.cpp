#include "StateVariableFilter.h"

#include <cmath>

namespace pristine {

// =====================================================
// PREPARE
// =====================================================

void StateVariableFilter::prepare(
    float sampleRate
) {

    mSampleRate = sampleRate;

    update();
}

// =====================================================
// UPDATE
// =====================================================

void StateVariableFilter::update() {

    mF =
        2.0f *
        sinf(
            static_cast<float>(
                M_PI *
                mFrequency /
                mSampleRate
            )
        );
}

// =====================================================
// SETTERS
// =====================================================

void StateVariableFilter::setFrequency(
    float frequency
) {

    mFrequency = frequency;

    update();
}

void StateVariableFilter::setResonance(
    float resonance
) {

    mResonance = resonance;
}

void StateVariableFilter::setMode(
    Mode mode
) {

    mMode = mode;
}

// =====================================================
// RESET
// =====================================================

void StateVariableFilter::reset() {

    mLow = 0.0f;
    mBand = 0.0f;
}

// =====================================================
// PROCESS
// =====================================================

float StateVariableFilter::process(
    float input
) {

    mLow +=
        mF * mBand;

    const float high =
        input -
        mLow -
        (
            mResonance *
            mBand
        );

    mBand +=
        mF * high;

    switch (mMode) {

        case LowPass:
            return mLow;

        case BandPass:
            return mBand;

        case HighPass:
            return high;

        default:
            return input;
    }
}

} // namespace pristine