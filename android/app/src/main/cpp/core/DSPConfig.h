// =====================================================
// core/DSPConfig.h
// =====================================================

#pragma once

#include <array>

#include "AudioTypes.h"

namespace pristine {

// =====================================================
// DSP CONFIG
// Shared realtime-safe DSP parameter block
// =====================================================

struct DSPConfig {

    // =============================================
    // GLOBAL
    // =============================================

    bool enabled = true;

    bool limiterEnabled = true;

    ProcessingMode mode =
        ProcessingMode::DSP;

    // =============================================
    // OUTPUT
    // =============================================

    float masterGain =
        1.0f;

    float balance =
        0.0f;

    float stereoWidth =
        1.0f;

    // =============================================
    // EQUALIZER
    // =============================================

    std::array<float, 10> eqGain = {
        0.0f,
        0.0f,
        0.0f,
        0.0f,
        0.0f,
        0.0f,
        0.0f,
        0.0f,
        0.0f,
        0.0f
    };

    float bassBoost =
        0.0f;

    // =============================================
    // IMMERSIVE AUDIO LAB
    // =============================================

    bool immersiveEnabled =
        false;

    float solfeggioFreq =
        528.0f;

    float brainwaveFreq =
        0.0f;

    float resonanceIntensity =
        0.5f;

    // =============================================
    // CONVOLUTION
    // =============================================

    bool convolverEnabled =
        false;

    // =============================================
    // HEADPHONE CORRECTION
    // =============================================

    bool headphoneCorrectionEnabled =
        false;

    // =============================================
    // RESET
    // =============================================

    void reset() {

        enabled = true;

        limiterEnabled = true;

        mode =
            ProcessingMode::DSP;

        masterGain = 1.0f;
        balance = 0.0f;
        stereoWidth = 1.0f;

        eqGain.fill(0.0f);

        bassBoost = 0.0f;

        immersiveEnabled = false;

        solfeggioFreq = 528.0f;
        brainwaveFreq = 0.0f;
        resonanceIntensity = 0.5f;

        convolverEnabled = false;

        headphoneCorrectionEnabled =
            false;
    }
};

} // namespace pristine