// =====================================================
// core/AudioConstants.h
// =====================================================

#pragma once

#include <cstdint>

namespace pristine {

// (kRingBufferSize dihapus 2026-11-12, C-FALLBACK: 131072 sampel =
// 512 KiB/instance — satu-satunya pemakai AudioBufferController dihapus
// bersama RingBuffer.h.)

// =====================================================
// CALLBACK
// =====================================================

constexpr int32_t kMaxFramesPerCallback =
    1920;

// (Konstanta visualizer kVizBufferSize/kVizBufferMask dihapus 2026-11-10:
// 0 pemakai. Ukuran buffer visualizer yang hidup ada di JNI kVisualizerSize.)

// (Konstanta equalizer kEqFrequencies/kEqDefaultQ/kNumEqBands dihapus
// 2026-11-10: 0 pemakai. Frekuensi EQ yang hidup ada di layer TS.)

// (Konstanta bass shelf kBassShelfFreq/kBassShelfQ dihapus 2026-11-10:
// 0 pemakai.)

// =====================================================
// AUDIO DEFAULTS
// =====================================================

constexpr int32_t kDefaultSampleRate =
    48000;

constexpr int32_t kDefaultChannelCount =
    2;

// (kDefaultFramesPerBurst dihapus 2026-11-10: 0 pemakai.)

// =====================================================
// DSP SAFETY
// =====================================================

// 🔥 FIX (2026-10-10, "noise di beberapa file"): dulu 1e-15f — itu ambang
// denormal untuk DOUBLE, bukan float.
//
// Denormal float mulai sekitar 1.2e-38 (FLT_MIN). Ambang 1e-15 berarti setiap
// sample dengan magnitudo di bawah 1e-15 dipaksa ke nol — yaitu decay reverb,
// ekor ambience, dan fade-out panjang. Sinyal yang seharusnya turun mulus ke
// -300 dB dipotong mendadak di -300 dB. Audible sebagai tail yang "hilang".
//
// 1e-30f aman: jauh di bawah ambang dengar di semua format, tapi masih di atas
// FLT_MIN sehingga benar-benar menangkap denormal.
constexpr float kDenormalThreshold =
    1e-30f;

// Ambang limiter. Sampai 2026-10-10 konstanta ini TIDAK DIBACA di mana pun —
// yang dipakai `softClip(x)=x/(1+|x|)` yang nonlinear di SELURUH rentang
// (-6 dB di full scale, THD 6.7% di amplitudo 0.5). Sekarang benar-benar
// dipakai oleh Limiter yang identity di bawah ambang.
constexpr float kLimiterThreshold =
    0.98f;

// (kMaxGainDb/kMinGainDb dihapus 2026-11-10: 0 pemakai.)

// (Konstanta solfeggio kSolfeggioFreqs/kNumSolfeggioFreqs dihapus 2026-11-10:
// 0 pemakai. Frekuensi solfeggio yang hidup ada di AudioState/DSPParameters.)

// (Konstanta latensi kTargetLatencyMs/kMaxSafeLatencyMs dihapus 2026-11-10:
// 0 pemakai.)

// (kRealtimeThreadPriority dihapus 2026-11-10: 0 pemakai.)

} // namespace pristine  