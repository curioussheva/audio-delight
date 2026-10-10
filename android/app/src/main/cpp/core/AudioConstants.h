// =====================================================
// core/AudioConstants.h
// =====================================================

#pragma once

#include <cstdint>

namespace pristine {

// =====================================================
// RING BUFFER
// =====================================================

constexpr uint32_t kRingBufferSize =
    131072; // power of two

constexpr uint32_t kRingBufferMask =
    kRingBufferSize - 1;

// =====================================================
// CALLBACK
// =====================================================

constexpr int32_t kMaxFramesPerCallback =
    1920;

// =====================================================
// VISUALIZER
// =====================================================

constexpr uint32_t kVizBufferSize =
    2048;

constexpr uint32_t kVizBufferMask =
    kVizBufferSize - 1;

// =====================================================
// EQUALIZER
// =====================================================

constexpr int kNumEqBands = 10;

constexpr float kEqFrequencies[kNumEqBands] = {

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

constexpr float kEqDefaultQ =
    1.414f;

// =====================================================
// BASS SHELF
// =====================================================

constexpr float kBassShelfFreq =
    100.0f;

constexpr float kBassShelfQ =
    0.707f;

// =====================================================
// AUDIO DEFAULTS
// =====================================================

constexpr int32_t kDefaultSampleRate =
    48000;

constexpr int32_t kDefaultChannelCount =
    2;

constexpr int32_t kDefaultFramesPerBurst =
    192;

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

constexpr float kMaxGainDb =
    24.0f;

constexpr float kMinGainDb =
    -24.0f;

// =====================================================
// IMMERSIVE AUDIO LAB
// =====================================================

constexpr int kNumSolfeggioFreqs = 9;

constexpr float kSolfeggioFreqs[
    kNumSolfeggioFreqs
] = {

    174.0f,
    285.0f,
    396.0f,
    417.0f,
    528.0f,
    639.0f,
    741.0f,
    852.0f,
    963.0f
};

// =====================================================
// LATENCY TARGETS
// =====================================================

constexpr float kTargetLatencyMs =
    20.0f;

constexpr float kMaxSafeLatencyMs =
    100.0f;

// =====================================================
// REALTIME THREAD
// =====================================================

constexpr int kRealtimeThreadPriority =
    -19;

} // namespace pristine  