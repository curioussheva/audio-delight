// =====================================================
// dsp/EQProcessor.cpp
// Production Modular EQ Processor
// =====================================================

#include "EQProcessor.h"

#include <cmath>

namespace pristine {

// =====================================================
// PREPARE
// =====================================================

void EQProcessor::prepare(
    int sampleRate
) noexcept {

    mSampleRate =
        static_cast<float>(
            sampleRate
        );

    for (
        int i = 0;
        i < kBands;
        ++i
    ) {

        updateBand(i);
    }

    updateBass();

    reset();
}

// =====================================================
// RESET
// =====================================================

void EQProcessor::reset() noexcept {

    for (
        int i = 0;
        i < kBands;
        ++i
    ) {

        mLeft[i].reset();
        mRight[i].reset();
    }

    mBassLeft.reset();
    mBassRight.reset();
}

// =====================================================
// PROCESS
// =====================================================

void EQProcessor::process(
    float* left,
    float* right,
    int32_t frames
) noexcept {

    for (
        int32_t i = 0;
        i < frames;
        ++i
    ) {

        float l = left[i];
        float r = right[i];

        // =========================================
        // PARAMETRIC EQ
        // =========================================

        for (
            int b = 0;
            b < kBands;
            ++b
        ) {

            if (!mBandEnabled[b]) {
                continue;
            }

            l =
                mLeft[b]
                    .process(l);

            r =
                mRight[b]
                    .process(r);
        }

        // =========================================
        // BASS BOOST
        // =========================================

        if (mBassEnabled) {

            l =
                mBassLeft.process(l);

            r =
                mBassRight.process(r);
        }

        left[i] = l;
        right[i] = r;
    }
}

// =====================================================
// SET BAND GAIN
// =====================================================

void EQProcessor::setBandGain(
    int band,
    float gainDb
) noexcept {

    if (
        band < 0 ||
        band >= kBands
    ) {
        return;
    }

    mBandGain[band] =
        gainDb;

    mBandEnabled[band] =
        std::fabs(gainDb)
        > 0.001f;

    updateBand(band);
}

// =====================================================
// SET BASS BOOST
// =====================================================

void EQProcessor::setBassBoost(
    float gainDb
) noexcept {

    mBassBoost =
        gainDb;

    mBassEnabled =
        std::fabs(gainDb)
        > 0.001f;

    updateBass();
}

// =====================================================
// SET ALL FLAT
// =====================================================

void EQProcessor::setAllFlat() noexcept {

    for (
        int i = 0;
        i < kBands;
        ++i
    ) {

        setBandGain(
            i,
            0.0f
        );
    }

    setBassBoost(0.0f);
}

// =====================================================
// UPDATE BAND
// =====================================================

void EQProcessor::updateBand(
    int band
) noexcept {

    BiquadFilter filter;

    filter.setPeakingEQ(
        kBandFreqs[band],
        1.414f,
        mBandGain[band],
        mSampleRate
    );

    const auto coeffs =
        filter.getCoefficients();

    mLeft[band]
        .setCoefficients(
            coeffs
        );

    mRight[band]
        .setCoefficients(
            coeffs
        );
}

// =====================================================
// UPDATE BASS
// =====================================================

void EQProcessor::updateBass() noexcept {

    BiquadFilter filter;

    filter.setLowShelf(
        100.0f,
        0.707f,
        mBassBoost,
        mSampleRate
    );

    const auto coeffs =
        filter.getCoefficients();

    mBassLeft
        .setCoefficients(
            coeffs
        );

    mBassRight
        .setCoefficients(
            coeffs
        );
}

} // namespace pristine