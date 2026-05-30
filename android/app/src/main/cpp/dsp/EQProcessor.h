// =====================================================
// dsp/EQProcessor.h
// Production Modular EQ Processor
// =====================================================

#pragma once

#include <cstdint>

#include "BiquadFilter.h"

namespace pristine {

// =====================================================
// 10-BAND PARAMETRIC EQ
// =====================================================

class EQProcessor {
public:

    static constexpr int kBands = 10;

    // =============================================
    // LIFECYCLE
    // =============================================

    void prepare(
        int sampleRate
    ) noexcept;

    void reset() noexcept;

    // =============================================
    // PROCESS
    // =============================================

    void process(
        float* left,
        float* right,
        int32_t frames
    ) noexcept;

    // =============================================
    // CONTROL
    // =============================================

    void setBandGain(
        int band,
        float gainDb
    ) noexcept;

    void setBassBoost(
        float gainDb
    ) noexcept;

    void setAllFlat() noexcept;

private:

    // =============================================
    // INTERNAL
    // =============================================

    void updateBand(
        int band
    ) noexcept;

    void updateBass() noexcept;

private:

    // =============================================
    // FILTERS
    // =============================================

    alignas(64)
    BiquadFilter mLeft[kBands];

    alignas(64)
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
    // OPTIMIZATION FLAGS
    // =============================================

    bool mBandEnabled[kBands] = {
        false
    };

    bool mBassEnabled = false;

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
};

} // namespace pristine 