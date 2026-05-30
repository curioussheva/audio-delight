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

constexpr float kDenormalThreshold =
    1e-15f;

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