// =====================================================
// dsp/GainProcessor.h
// SIMD Optimized Gain Processor
// =====================================================

#pragma once

#include <algorithm>
#include <cstdint>

#if defined(__ARM_NEON) || defined(__ARM_NEON__)
#include <arm_neon.h>
#endif

namespace pristine {

// =====================================================
// GAIN PROCESSOR
// =====================================================

class GainProcessor {
public:

    // =============================================
    // PROCESS
    // =============================================

    static inline void process(
        float* left,
        float* right,
        int32_t frames,
        float gainL,
        float gainR
    ) noexcept {

        // =========================================
        // SAFETY
        // =========================================

        if (
            !left ||
            !right ||
            frames <= 0
        ) {
            return;
        }

#if defined(__ARM_NEON) || defined(__ARM_NEON__)

        // =========================================
        // SIMD PATH (ARM NEON)
        // =========================================

        const float32x4_t gainLV =
            vdupq_n_f32(gainL);

        const float32x4_t gainRV =
            vdupq_n_f32(gainR);

        int32_t i = 0;

        for (
            ;
            i <= frames - 4;
            i += 4
        ) {

            float32x4_t l =
                vld1q_f32(
                    left + i
                );

            float32x4_t r =
                vld1q_f32(
                    right + i
                );

            l =
                vmulq_f32(
                    l,
                    gainLV
                );

            r =
                vmulq_f32(
                    r,
                    gainRV
                );

            vst1q_f32(
                left + i,
                l
            );

            vst1q_f32(
                right + i,
                r
            );
        }

        // =========================================
        // SCALAR REMAINDER
        // =========================================

        for (
            ;
            i < frames;
            ++i
        ) {

            left[i] *= gainL;
            right[i] *= gainR;
        }

#else

        // =========================================
        // SCALAR FALLBACK
        // =========================================

        for (
            int32_t i = 0;
            i < frames;
            ++i
        ) {

            left[i] *= gainL;
            right[i] *= gainR;
        }

#endif
    }
};

} // namespace pristine