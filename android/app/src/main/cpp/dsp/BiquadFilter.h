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

    // B13-K2: mengembalikan false bila parameter ditolak (sample rate
    // tak valid atau freq/Q/gainDb tak hingga) — koefisien lama
    // dipertahankan. Bila lolos, parameter di-clamp (freq [1, 0.49*sr],
    // Q [0.1, 20], gain [-40, +40] dB) lalu koefisien dihitung.
    bool setPeakingEQ(
        float freq,
        float Q,
        float gainDb,
        float sampleRate
    );

    bool setLowShelf(
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
    //
    // B13-K2: `Q` di sini adalah Q (bentuk alpha = sin(w0)/(2*Q), sama
    // seperti peaking/low shelf dan seperti yang dipakai AutoEQ) — BUKAN
    // slope S RBJ. Bentuk S lama dihapus karena sqrt-nya bisa negatif
    // → NaN (mis. Q=2/+30 dB, Q=4/+15 dB).
    bool setHighShelf(
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
