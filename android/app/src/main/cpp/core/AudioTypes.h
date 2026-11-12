// =====================================================
// core/AudioTypes.h
// =====================================================

#pragma once

#include <cstdint>
#include <cstring>

namespace pristine {

// =====================================================
// SAMPLE TYPE
// =====================================================

using Sample = float;

// =====================================================
// FINITE / CLAMP (C-P2, 2026-11-12)
// =====================================================
//
// Nilai float dari JS (JNI jfloat) TIDAK tervalidasi: NaN/Inf yang lolos
// masuk ke AudioState lalu ke koefisien biquad (powf(10, NaN/40) = NaN) dan
// menetap di state DF-II (z1/z2) — hanya reset() via stop/reopen yang
// membersihkan. Output ke DAC tetap aman (sanitizeOutput + limiter), yang
// terdengar SENYAP, bukan rusak.
//
// Uji finite di sini memakai BIT-PATTERN, bukan std::isnan/std::isfinite:
// eksponen 0xFF (semua bit 1) = NaN atau Inf, apa pun mantissa-nya (termasuk
// NaN ber-payload dan signaling NaN). CMakeLists.txt:244 eksplisit
// -fno-fast-math, jadi std::isnan sebetulnya andal — tapi bit-pattern tetap
// benar walau flag itu berubah suatu hari, dan tidak bergantung pada
// optimasi compiler. std::memcpy dipakai supaya tidak ada UB aliasing
// (bukan reinterpret_cast / union punning).
//
// Helper ini tinggal di AudioTypes.h — header dasar yang sudah di-include
// AudioState.h, DSPConfig.h (lewat DSPNode.h), dan ImmersiveStage.h —
// supaya dipakai AudioState (semua setter float, C-P2) dan nanti
// ImmersiveStage/resonator (item 27) tanpa pindah-pindah letak.

// true bila `value` finite (bukan NaN, bukan ±Inf). Denormal dan -0.0
// dihitung finite.
inline bool isFiniteFloat(
    float value
) noexcept {

    uint32_t bits = 0;

    std::memcpy(
        &bits,
        &value,
        sizeof(bits)
    );

    return (bits & 0x7F800000u) != 0x7F800000u;
}

// Nilai non-finite (NaN/Inf) TIDAK punya urutan — tidak bisa di-clamp ke
// batas — jadi dikembalikan ke `fallback`. Nilai finite di luar [lo, hi]
// di-clamp ke batas terdekat. Nilai valid di dalam rentang tidak berubah.
inline float clampFinite(
    float value,
    float lo,
    float hi,
    float fallback
) noexcept {

    if (!isFiniteFloat(value)) {
        return fallback;
    }

    if (value < lo) {
        return lo;
    }

    if (value > hi) {
        return hi;
    }

    return value;
}

// =====================================================
// PROCESSING MODE
// =====================================================

enum class ProcessingMode : int32_t {

    BitPerfect = 0,
    DSP = 1,
    Immersive = 2
};

// (C-CAST, 2026-11-12): satu-satunya sumber kebenaran untuk "mode valid".
// Dipakai JNI (sebelum static_cast dari jint) dan EngineManager (lapis
// kedua) — jangan duplikasi rentang 0..2 di tiap call site, nanti drift.
// Perbandingan eksplisit per varian, bukan rentang numerik: kalau enum
// kelak tidak lagi kontigu, cek ini tetap benar.
inline bool isValidProcessingMode(
    ProcessingMode mode
) noexcept {

    return mode == ProcessingMode::BitPerfect ||
           mode == ProcessingMode::DSP ||
           mode == ProcessingMode::Immersive;
}

// (ChannelLayout dihapus 2026-11-12, C-CLEAN(c): 0 pemakai. Jangan
// disamakan dengan decoder::ChannelLayout di decoder/DecoderTypes.h:27,
// yang masih dipakai decoder.)
// (StreamState dihapus 2026-11-10: 0 pemakai.)
// (AudioRoute dihapus 2026-11-12, C-CLEAN(c): 0 pemakai.)

// (AudioFormat dihapus 2026-11-12, C-CLEAN(c): 0 pemakai. Jangan
// disamakan dengan decoder::AudioFormat di decoder/DecoderTypes.h:37,
// yang masih dipakai decoder.)

// (PerformanceMode dihapus 2026-11-12, C-CLEAN(c): 0 pemakai. Jangan
// disamakan dengan oboe::PerformanceMode, yang dipakai
// AudioStreamController.cpp:239-240.)

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

    // (C-DEFMODE, 2026-11-12): default = DSP, sama seperti AudioState
    // (mProcessingMode) dan DSPConfig — pemenang runtime adalah AudioState:
    // updateParameters() menimpa field ini tiap buffer dari sana. Dulu
    // BitPerfect dengan komentar "FIX: default bypass DSP" — tidak pernah
    // berefek (struct ini hanya wadah snapshot per-buffer) dan menyesatkan.
    ProcessingMode processingMode =
        ProcessingMode::DSP;

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