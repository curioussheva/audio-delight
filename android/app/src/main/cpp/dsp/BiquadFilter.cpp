// =====================================================
// dsp/BiquadFilter.cpp
// RBJ Audio EQ Cookbook Implementation
// =====================================================

#include "BiquadFilter.h"

#include <algorithm>
#include <cmath>

namespace pristine {

namespace {

// =====================================================
// DESIGN OK (B13-K2)
// =====================================================
//
// Validasi + clamp parameter desain, dipakai di awal ketiga setter.
// Return false -> pemanggil TIDAK BOLEH menyentuh koefisien lama
// (filter tetap pakai koefisien sebelumnya, atau identitas bila belum
// pernah didesain). Return true -> parameter sudah di-clamp in-place:
//   freq   -> [1, 0.49 * sampleRate]  (di bawah Nyquist, stabil)
//   Q      -> [0.1, 20]
//   gainDb -> [-40, +40]
bool designOk(float& freq, float& q, float& gainDb, float sampleRate) {
    if (!(sampleRate > 0.0f) ||
        !std::isfinite(freq) ||
        !std::isfinite(q) ||
        !std::isfinite(gainDb)) {
        return false;
    }

    freq = std::clamp(freq, 1.0f, 0.49f * sampleRate);
    q = std::clamp(q, 0.1f, 20.0f);
    gainDb = std::clamp(gainDb, -40.0f, 40.0f);
    return true;
}

} // namespace

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

bool BiquadFilter::setPeakingEQ(
    float freq,
    float Q,
    float gainDb,
    float sampleRate
) {

    if (!designOk(freq, Q, gainDb, sampleRate)) {
        return false;
    }

    // =============================================
    // RBJ COOKBOOK (B13-K2-double: hitung dalam double)
    // =============================================

    const double A =
        std::pow(
            10.0,
            gainDb / 40.0
        );

    const double w0 =
        2.0 *
        M_PI *
        freq /
        sampleRate;

    const double cosW0 =
        std::cos(w0);

    const double sinW0 =
        std::sin(w0);

    const double alpha =
        sinW0 /
        (2.0 * Q);

    const double a0 =
        1.0 +
        alpha / A;

    coeffs.b0 =
        (1.0 + alpha * A) /
        a0;

    coeffs.b1 =
        (-2.0 * cosW0) /
        a0;

    coeffs.b2 =
        (1.0 - alpha * A) /
        a0;

    coeffs.a1 =
        (-2.0 * cosW0) /
        a0;

    coeffs.a2 =
        (1.0 - alpha / A) /
        a0;

    return true;
}

// =====================================================
// LOW SHELF
// =====================================================

bool BiquadFilter::setLowShelf(
    float freq,
    float Q,
    float gainDb,
    float sampleRate
) {

    if (!designOk(freq, Q, gainDb, sampleRate)) {
        return false;
    }

    // =============================================
    // RBJ COOKBOOK (B13-K2-double: hitung dalam double)
    // =============================================

    const double A =
        std::pow(
            10.0,
            gainDb / 40.0
        );

    const double w0 =
        2.0 *
        M_PI *
        freq /
        sampleRate;

    const double cosW0 =
        std::cos(w0);

    const double sinW0 =
        std::sin(w0);

    const double alpha =
        sinW0 /
        (2.0 * Q);

    const double beta =
        2.0 *
        std::sqrt(A) *
        alpha;

    const double a0 =
        (A + 1.0) +
        ((A - 1.0) * cosW0) +
        beta;

    coeffs.b0 =
        A *
        (
            (A + 1.0) -
            ((A - 1.0) * cosW0) +
            beta
        ) / a0;

    coeffs.b1 =
        2.0 *
        A *
        (
            (A - 1.0) -
            ((A + 1.0) * cosW0)
        ) / a0;

    coeffs.b2 =
        A *
        (
            (A + 1.0) -
            ((A - 1.0) * cosW0) -
            beta
        ) / a0;

    coeffs.a1 =
        -2.0 *
        (
            (A - 1.0) +
            ((A + 1.0) * cosW0)
        ) / a0;

    coeffs.a2 =
        (
            (A + 1.0) +
            ((A - 1.0) * cosW0) -
            beta
        ) / a0;

    return true;
}

// =====================================================
// HIGH SHELF
// =====================================================

bool BiquadFilter::setHighShelf(
    float freq,
    float Q,
    float gainDb,
    float sampleRate
) {

    if (!designOk(freq, Q, gainDb, sampleRate)) {
        return false;
    }

    // =============================================
    // RBJ COOKBOOK (B13-K2-double: hitung dalam double)
    // =============================================
    //
    // Cerminan low shelf: semua tanda `cosW0` dibalik. `Q` di sini adalah
    // Q (bentuk alpha = sin(w0)/(2*Q), seperti low shelf dan seperti yang
    // dipakai AutoEQ) — BUKAN slope S RBJ. Bentuk S lama dihapus B13-K2
    // karena sqrt-nya bisa negatif -> NaN (mis. Q=2/+30 dB, Q=4/+15 dB).

    const double A =
        std::pow(
            10.0,
            gainDb / 40.0
        );

    const double w0 =
        2.0 *
        M_PI *
        freq /
        sampleRate;

    const double cosW0 =
        std::cos(w0);

    const double sinW0 =
        std::sin(w0);

    const double alpha =
        sinW0 /
        (2.0 * Q);

    const double beta =
        2.0 *
        std::sqrt(A) *
        alpha;

    const double a0 =
        (A + 1.0) -
        ((A - 1.0) * cosW0) +
        beta;

    coeffs.b0 =
        A *
        (
            (A + 1.0) +
            ((A - 1.0) * cosW0) +
            beta
        ) / a0;

    coeffs.b1 =
        -2.0 *
        A *
        (
            (A - 1.0) +
            ((A + 1.0) * cosW0)
        ) / a0;

    coeffs.b2 =
        A *
        (
            (A + 1.0) +
            ((A - 1.0) * cosW0) -
            beta
        ) / a0;

    coeffs.a1 =
        2.0 *
        (
            (A - 1.0) -
            ((A + 1.0) * cosW0)
        ) / a0;

    coeffs.a2 =
        (
            (A + 1.0) -
            ((A - 1.0) * cosW0) -
            beta
        ) / a0;

    return true;
}

} // namespace pristine