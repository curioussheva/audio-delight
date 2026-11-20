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
    // REVERB (2026-11-19)
    // =============================================
    //
    // Preset Android PresetReverb 0..6 (0 = Off). Daftar preset sama
    // dengan ReverbDropdown / REVERB_PRESET_MAP di JS; pemetaan ke
    // parameter filter ada di ReverbParams::fromPreset() (dsp/tone/
    // ReverbNode.h). Node membaca field ini lewat applyConfig.

    int reverbPreset =
        0;

    // =============================================
    // HRTF (2026-11-19)
    // =============================================
    //
    // Virtual speaker ±30° (HRTFNode, sesudah reverb, sebelum gain).
    // Toggle sendiri, DI LUAR preset EQ (keputusan user): preset
    // adalah kurva nada, tidak boleh diam-diam menghidupkan efek
    // spasial yang hanya bekerja di headphone.

    bool hrtfEnabled =
        false;

    // =============================================
    // CONVOLVER (2026-11-20)
    // =============================================
    //
    // Impulse response loader (ConvolverNode, sesudah reverb, sebelum
    // HRTF — lihat DSPChain::buildGraph). Toggle sendiri, DI LUAR
    // preset EQ (keputusan yang sama dengan HRTF): preset adalah
    // kurva nada, tidak boleh diam-diam menghidupkan efek ruang.
    // IR-nya sendiri TIDAK di sini (terlalu besar) — ia tinggal di
    // DSPChain dan dimuat lewat loadConvolverIr().
    //
    // Catatan nama: field `convolverEnabled` PERNAH ada di struct ini
    // dan dihapus 2026-11-10 karena tidak pernah dibaca (komentar lama
    // di bawah menyebutnya). Field ini BUKAN yang lama dihidupkan
    // kembali tanpa arti — sekarang ia DIBACA ConvolverNode::
    // applyConfig, jadi penghapusan lama itu tidak berlaku lagi.

    bool convolverEnabled =
        false;

    // (Field immersiveEnabled/solfeggioFreq/brainwaveFreq/resonanceIntensity/
    // dihapus 2026-11-10: tidak pernah dibaca — ImmersiveStage
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

        reverbPreset = 0;

        hrtfEnabled = false;

        convolverEnabled = false;

        headphoneCorrectionEnabled =
            false;

        headphonePreset =
            HeadphonePresetData{};
    }
};

} // namespace pristine