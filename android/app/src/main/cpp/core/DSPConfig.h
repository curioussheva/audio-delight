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

    // (Field immersiveEnabled/solfeggioFreq/brainwaveFreq/resonanceIntensity/
    // convolverEnabled dihapus 2026-11-10: tidak pernah dibaca — ImmersiveStage
    // membaca parameter langsung dari DSPParameters, bukan lewat DSPConfig.
    // Lihat dspConfigEquals yang memang sengaja tidak membandingkannya.)

    // =============================================
    // HEADPHONE CORRECTION
    // =============================================
    //
    // 🔥 FASE D (2026-10-10): preset hasil parse ikut di sini supaya node
    // `HeadphoneCorrectionNode` bisa menerapkannya lewat jalur `applyConfig()`
    // yang sama dengan node lain — tanpa jalur samping.

    bool headphoneCorrectionEnabled =
        false;

    HeadphonePresetData headphonePreset;

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

        headphoneCorrectionEnabled =
            false;

        headphonePreset =
            HeadphonePresetData{};
    }
};

} // namespace pristine