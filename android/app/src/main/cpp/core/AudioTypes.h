// =====================================================
// core/AudioTypes.h
// =====================================================

#pragma once

#include <cstdint>

namespace pristine {

// =====================================================
// SAMPLE TYPE
// =====================================================

using Sample = float;

// =====================================================
// CHANNEL LAYOUT
// =====================================================

enum class ChannelLayout : uint8_t {

    Mono  = 1,
    Stereo = 2
};

// =====================================================
// PROCESSING MODE
// =====================================================

enum class ProcessingMode : int32_t {

    BitPerfect = 0,
    DSP = 1,
    Immersive = 2
};

// =====================================================
// AUDIO ROUTE
// =====================================================

enum class AudioRoute : int32_t {

    Wired = 0,
    Bluetooth,
    USBExclusive,
    Default
};

// (StreamState dihapus 2026-11-10: 0 pemakai.)

// =====================================================
// AUDIO FORMAT
// =====================================================

enum class AudioFormat : uint8_t {

    PCM16 = 0,
    PCM24,
    PCM32,
    Float32
};

// =====================================================
// PERFORMANCE MODE
// =====================================================

enum class PerformanceMode : uint8_t {

    LowLatency = 0,
    PowerSaving
};

// (VisualizerMode + OutputDeviceType dihapus 2026-11-10: 0 pemakai.)

// =====================================================
// HEADPHONE CORRECTION PRESET
// Bentuk POD yang siap dipakai audio thread
// =====================================================
//
// Hasil parse preset koreksi headphone, sudah dalam bentuk siap pakai.
// POD murni: tanpa std::string, tanpa std::vector, tanpa alokasi. Ukurannya
// tetap sehingga bisa disalin di audio thread.
//
// 🔥 PENTING: teks preset TIDAK di-parse di audio thread. Parsing dilakukan
// di UI thread (mahal, mengalokasi), hasilnya ditulis ke struct ini, dan
// audio thread hanya menyalinnya. Lihat AudioState::headphonePreset().

struct HeadphoneFilterParams {

    // 0 = Peaking, 1 = LowShelf, 2 = HighShelf.
    // Sengaja int, bukan enum class, supaya struct ini tetap POD dan
    // bisa disalin dengan memcpy.
    int32_t type =
        0;

    float freqHz =
        0.0f;

    float q =
        0.707f;

    float gainDb =
        0.0f;
};

struct HeadphonePresetData {

    float preampDb =
        0.0f;

    // 0..16. Di atas itu preset ditolak saat parse, tidak dipotong.
    int32_t filterCount =
        0;

    // Sama dengan BiquadCascade::kMaxFilters. Duplikasi angka ini disengaja:
    // AudioTypes.h adalah header dasar yang tidak boleh mengimpor dsp/.
    static constexpr int32_t kMaxFilters = 16;

    HeadphoneFilterParams filters[kMaxFilters];
};

// =====================================================
// DSP PARAMETERS
// =====================================================

struct DSPParameters {

    // =============================================
    // EQUALIZER
    // =============================================

    float eqGains[10] = {
        0.0f
    };

    float bassBoostGain =
        0.0f;

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
    // FLAGS
    // =============================================

    bool dspEnabled =
        true;

    bool limiterEnabled =
        true;

    ProcessingMode processingMode =
        ProcessingMode::BitPerfect;  // 🔥 FIX: default bypass DSP

    // =============================================
    // IMMERSIVE AUDIO LAB
    // =============================================
 
    float solfeggioFreq =
        528.0f;

    float brainwaveFreq =
        0.0f;

    float resonanceIntensity =
        0.5f;

    // =============================================
    // HEADPHONE CORRECTION
    // =============================================
    //
    // Preset hasil parse, dalam bentuk POD. Disalin dari AudioState tiap
    // buffer (16 filter = ~272 byte, murah) — TIDAK di-parse di sini.

    HeadphonePresetData headphonePreset;

    bool headphoneCorrectionEnabled =
        false;
};

// (StereoFrame / AudioBufferView / InterleavedBufferView / LatencyInfo /
// AudioDeviceInfo (deprecated) / EngineConfig dihapus 2026-11-10:
// 0 pemakai di seluruh tree. AudioDeviceInfo yang hidup adalah
// android.media.AudioDeviceInfo di JNI, bukan struct ini.)

} // namespace pristine 