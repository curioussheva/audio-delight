// =====================================================
// utils/SIMD.h
// =====================================================

#pragma once

#include <cstdint>

// =====================================================
// SIMD DETECTION
// =====================================================

#if defined(__ARM_NEON) || defined(__ARM_NEON__)

    #define PRISTINE_SIMD_NEON 1
    #include <arm_neon.h>

#else

    #define PRISTINE_SIMD_NEON 0

#endif

namespace pristine::simd {

// =====================================================
// GAIN PROCESSING
// =====================================================

inline void applyGain(
    float* buffer,
    int32_t count,
    float gain
) {

#if PRISTINE_SIMD_NEON

    const float32x4_t gainV =
        vdupq_n_f32(gain);

    int32_t i = 0;

    for (; i <= count - 4; i += 4) {

        float32x4_t x =
            vld1q_f32(buffer + i);

        x = vmulq_f32(x, gainV);

        vst1q_f32(buffer + i, x);
    }

    for (; i < count; ++i) {
        buffer[i] *= gain;
    }

#else

    for (int32_t i = 0; i < count; ++i) {
        buffer[i] *= gain;
    }

#endif
}

// =====================================================
// STEREO GAIN
// =====================================================

inline void applyStereoGain(
    float* left,
    float* right,
    int32_t count,
    float gainL,
    float gainR
) {

#if PRISTINE_SIMD_NEON

    const float32x4_t gainLV =
        vdupq_n_f32(gainL);

    const float32x4_t gainRV =
        vdupq_n_f32(gainR);

    int32_t i = 0;

    for (; i <= count - 4; i += 4) {

        float32x4_t l =
            vld1q_f32(left + i);

        float32x4_t r =
            vld1q_f32(right + i);

        l = vmulq_f32(l, gainLV);
        r = vmulq_f32(r, gainRV);

        vst1q_f32(left + i, l);
        vst1q_f32(right + i, r);
    }

    for (; i < count; ++i) {

        left[i] *= gainL;
        right[i] *= gainR;
    }

#else

    for (int32_t i = 0; i < count; ++i) {

        left[i] *= gainL;
        right[i] *= gainR;
    }

#endif
}

}