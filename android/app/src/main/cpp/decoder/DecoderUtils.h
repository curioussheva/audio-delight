#pragma once

#include <cstdint>

namespace pristine {

// =====================================================
// PCM CONVERSION
// =====================================================

void s16ToFloat(
    const int16_t* src,
    float* dst,
    int32_t numSamples
);

void s24ToFloat(
    const uint8_t* src,
    float* dst,
    int32_t numSamples
);

void s32ToFloat(
    const int32_t* src,
    float* dst,
    int32_t numSamples
);

// =====================================================
// LAYOUT CONVERSION
// =====================================================

void interleavedStereoToPlanar(
    const float* interleaved,
    float* left,
    float* right,
    int32_t frames
);

void planarStereoToInterleaved(
    const float* left,
    const float* right,
    float* interleaved,
    int32_t frames
);

// =====================================================
// UTILITY
// =====================================================

void zeroBuffer(
    float* buffer,
    int32_t samples
);

void applyGain(
    float* buffer,
    int32_t samples,
    float gain
);

} // namespace pristine