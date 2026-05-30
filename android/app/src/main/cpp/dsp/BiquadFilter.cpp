// =====================================================
// dsp/BiquadFilter.cpp
// RBJ Audio EQ Cookbook Implementation
// =====================================================

#include "BiquadFilter.h"

#include <cmath>

namespace pristine {

// =====================================================
// SET COEFFICIENTS
// =====================================================

void BiquadFilter::setCoefficients(
    const BiquadCoefficients& c
) {

    coeffs = c;
}

// =====================================================
// GET COEFFICIENTS
// =====================================================

const BiquadCoefficients&
BiquadFilter::getCoefficients() const {

    return coeffs;
}

// =====================================================
// PEAKING EQ
// =====================================================

void BiquadFilter::setPeakingEQ(
    float freq,
    float Q,
    float gainDb,
    float sampleRate
) {

    // =============================================
    // SAFETY
    // =============================================

    if (
        freq <= 0.0f ||
        sampleRate <= 0.0f ||
        Q <= 0.0f
    ) {
        return;
    }

    // =============================================
    // RBJ COOKBOOK
    // =============================================

    const float A =
        powf(
            10.0f,
            gainDb / 40.0f
        );

    const float w0 =
        2.0f *
        static_cast<float>(M_PI) *
        freq /
        sampleRate;

    const float cosW0 =
        cosf(w0);

    const float sinW0 =
        sinf(w0);

    const float alpha =
        sinW0 /
        (2.0f * Q);

    const float a0 =
        1.0f +
        alpha / A;

    coeffs.b0 =
        (1.0f + alpha * A) /
        a0;

    coeffs.b1 =
        (-2.0f * cosW0) /
        a0;

    coeffs.b2 =
        (1.0f - alpha * A) /
        a0;

    coeffs.a1 =
        (-2.0f * cosW0) /
        a0;

    coeffs.a2 =
        (1.0f - alpha / A) /
        a0;
}

// =====================================================
// LOW SHELF
// =====================================================

void BiquadFilter::setLowShelf(
    float freq,
    float Q,
    float gainDb,
    float sampleRate
) {

    // =============================================
    // SAFETY
    // =============================================

    if (
        freq <= 0.0f ||
        sampleRate <= 0.0f ||
        Q <= 0.0f
    ) {
        return;
    }

    // =============================================
    // RBJ COOKBOOK
    // =============================================

    const float A =
        powf(
            10.0f,
            gainDb / 40.0f
        );

    const float w0 =
        2.0f *
        static_cast<float>(M_PI) *
        freq /
        sampleRate;

    const float cosW0 =
        cosf(w0);

    const float sinW0 =
        sinf(w0);

    const float alpha =
        sinW0 /
        (2.0f * Q);

    const float beta =
        2.0f *
        sqrtf(A) *
        alpha;

    const float a0 =
        (A + 1.0f) +
        ((A - 1.0f) * cosW0) +
        beta;

    coeffs.b0 =
        A *
        (
            (A + 1.0f) -
            ((A - 1.0f) * cosW0) +
            beta
        ) / a0;

    coeffs.b1 =
        2.0f *
        A *
        (
            (A - 1.0f) -
            ((A + 1.0f) * cosW0)
        ) / a0;

    coeffs.b2 =
        A *
        (
            (A + 1.0f) -
            ((A - 1.0f) * cosW0) -
            beta
        ) / a0;

    coeffs.a1 =
        -2.0f *
        (
            (A - 1.0f) +
            ((A + 1.0f) * cosW0)
        ) / a0;

    coeffs.a2 =
        (
            (A + 1.0f) +
            ((A - 1.0f) * cosW0) -
            beta
        ) / a0;
}

} // namespace pristine