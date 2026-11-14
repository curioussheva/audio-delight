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

        // (B14-E3, 2026-11-14): NaN/negatif -> 1.0 dulu (defense-in-depth;
        // jalur live sudah dijaga clampFinite di AudioState, tapi
        // std::clamp(NaN) mengembalikan NaN). Lalu bypass bit-exact di
        // width 1.0: (l+r)*0.5 + (l-r)*0.5 tidak mengembalikan l persis
        // (selisih 1 ulp) — dalam mode DSP netral widener adalah
        // satu-satunya tahap yang mengubah sampel, jadi tanpa bypass ini
        // DSP netral tidak pernah sama dengan BitPerfect secara bit.
        if (!(width >= 0.0f)) {
            width = 1.0f;
        }

        width =
            std::clamp(
                width,
                0.0f,
                2.0f
            );

        if (width == 1.0f) {
            return;
        }

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