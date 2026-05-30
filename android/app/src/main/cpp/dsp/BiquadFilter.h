#pragma once

#include "BiquadFilter.h"

namespace pristine {

// =====================================================
// 10-BAND PARAMETRIC EQ PROCESSOR
// =====================================================

class EQProcessor {
public:

    static constexpr int kBands = 10;

    // =============================================
    // PREPARE
    // =============================================

    void prepare(
        int sampleRate
    );

    // =============================================
    // PROCESS
    // =============================================

    inline void process(
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

            // =====================================
            // PARAMETRIC EQ
            // =====================================

            for (
                int b = 0;
                b < kBands;
                ++b
            ) {

                l =
                    mLeft[b]
                        .process(l);

                r =
                    mRight[b]
                        .process(r);
            }

            // =====================================
            // BASS BOOST
            // =====================================

            l =
                mBassLeft.process(l);

            r =
                mBassRight.process(r);

            left[i] = l;
            right[i] = r;
        }
    }

    // =============================================
    // EQ CONTROL
    // =============================================

    void setBandGain(
        int band,
        float gainDb
    );

    void setBassBoost(
        float gainDb
    );

    // =============================================
    // RESET
    // =============================================

    void reset();

private:

    // =============================================
    // FILTERS
    // =============================================

    BiquadFilter mLeft[kBands];
    BiquadFilter mRight[kBands];

    BiquadFilter mBassLeft;
    BiquadFilter mBassRight;

    // =============================================
    // PARAMETERS
    // =============================================

    float mSampleRate = 48000.0f;

    float mBandGain[kBands] = {
        0.0f
    };

    float mBassBoost = 0.0f;

    // =============================================
    // CONSTANTS
    // =============================================

    static constexpr float kBandFreqs[kBands] = {
        31.0f,
        62.0f,
        125.0f,
        250.0f,
        500.0f,
        1000.0f,
        2000.0f,
        4000.0f,
        8000.0f,
        16000.0f
    };

    // =============================================
    // INTERNAL
    // =============================================

    void updateBand(
        int band
    );

    void updateBass();
};

} // namespace pristine