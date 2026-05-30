// =====================================================
// dsp/StereoWidener.h
// Production Version
// =====================================================

#pragma once

#include <algorithm>
#include <cstdint>

namespace pristine {

// =====================================================
// MID/SIDE STEREO WIDENER
// =====================================================

class StereoWidener {
public:

    // =============================================
    // PROCESS
    // =============================================

    static inline void process(
        float* left,
        float* right,
        int32_t frames,
        float width
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

        // =========================================
        // CLAMP WIDTH
        //
        // 0.0  = mono
        // 1.0  = original
        // 2.0  = ultra wide
        // =========================================

        width =
            std::clamp(
                width,
                0.0f,
                2.0f
            );

        // =========================================
        // MID/SIDE PROCESSING
        // =========================================

        for (
            int32_t i = 0;
            i < frames;
            ++i
        ) {

            const float l =
                left[i];

            const float r =
                right[i];

            const float mid =
                (l + r) * 0.5f;

            const float side =
                (l - r) *
                0.5f *
                width;

            left[i] =
                mid + side;

            right[i] =
                mid - side;
        }
    }
};

} // namespace pristine 