#pragma once

namespace pristine {

// =====================================================
// BIQUAD COEFFICIENTS
// =====================================================

struct BiquadCoefficients {
    float b0 = 1.0f;
    float b1 = 0.0f;
    float b2 = 0.0f;
    float a1 = 0.0f;
    float a2 = 0.0f;
};

// =====================================================
// BIQUAD FILTER
// Direct Form II Transposed
// RBJ Audio EQ Cookbook coefficients
// =====================================================

class BiquadFilter {
public:

    // =============================================
    // COEFFICIENTS
    // =============================================

    void setCoefficients(
        const BiquadCoefficients& c
    );

    [[nodiscard]]
    const BiquadCoefficients&
    getCoefficients() const;

    // =============================================
    // FILTER DESIGN
    // =============================================

    void setPeakingEQ(
        float freq,
        float Q,
        float gainDb,
        float sampleRate
    );

    void setLowShelf(
        float freq,
        float Q,
        float gainDb,
        float sampleRate
    );

    // 🔥 FIX (2026-10-10): high shelf — cerminan `setLowShelf` (RBJ cookbook).
    //
    // Sebelumnya tidak ada, padahal `dsp/filters/ToneControl.h:33` sudah
    // memanggilnya sejak lama. Karena `ToneControl` nol pemanggil, badan member
    // non-template yang didefinisikan in-class tidak pernah di-emit → error
    // kompilasi laten, tidak terlihat sampai kelas itu benar-benar dipakai.
    //
    // Dibutuhkan preset AutoEQ/Squiglink: tipe `HSC` (high shelf) hampir selalu
    // ada. Lihat docs/HEADPHONE_CORRECTION.md §8.1.
    void setHighShelf(
        float freq,
        float Q,
        float gainDb,
        float sampleRate
    );

    // =============================================
    // PROCESS
    // =============================================

    inline float process(
        float x
    ) noexcept {

        const float y =
            coeffs.b0 * x + z1;

        z1 =
            coeffs.b1 * x -
            coeffs.a1 * y +
            z2;

        z2 =
            coeffs.b2 * x -
            coeffs.a2 * y;

        return y;
    }

    // =============================================
    // RESET
    // =============================================

    inline void reset() noexcept {
        z1 = 0.0f;
        z2 = 0.0f;
    }

private:

    BiquadCoefficients coeffs;

    float z1 = 0.0f;
    float z2 = 0.0f;
};

} // namespace pristine
