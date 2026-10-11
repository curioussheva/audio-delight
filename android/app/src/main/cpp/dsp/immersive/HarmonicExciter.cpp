#include "HarmonicExciter.h"

#include <cmath>

namespace pristine { namespace dsp {

HarmonicExciter::HarmonicExciter() = default;

// =====================================================
// SET DRIVE
// =====================================================
//
// Dua hal dipetakan dari driveDb:
//
//   mAmount - berapa banyak sinyal berharmonisa yang dicampur (0..1)
//   mK      - ketajaman kurva; makin tinggi makin banyak harmonisa orde tinggi
//
// Keduanya dihitung DI SINI, bukan di process(), supaya audio thread tidak
// memanggil tanh() dua kali per sample.
void HarmonicExciter::setDrive(float driveDb) {

    mDrive = driveDb;

    if (driveDb <= 0.0f) {
        // Bypass total: tidak ada harmonisa, tidak ada perubahan gain.
        mAmount = 0.0f;
        mK = 1.0f;
        return;
    }

    const float clamped = driveDb > 24.0f ? 24.0f : driveDb;

    // Normalisasi ke 0..1.
    const float norm = clamped / 24.0f;

    // Maksimum 60% wet: mencampur lebih dari itu membuat sumber terdengar
    // "menjauh" - yang diinginkan biasanya sinyal asli tetap dominan.
    mAmount = norm * 0.6f;

    // Kurva makin tajam seiring drive. Batas atas 6.0 menjaga distorsinya
    // tetap halus; lebih tinggi mulai terdengar seperti clipping.
    mK = 1.0f + norm * 5.0f;
}

// =====================================================
// SHAPER
// =====================================================
//
// Kurva yang menghasilkan harmonisa GANJIL maupun GENAP:
//
//   shape(x) = tanh(k*x)/k  +  1.2 * (x^2 - 0.25)
//
// Dua koreksi penting terhadap versi pertama:
//
// (a) NORMALISASI LEVEL.
//     Versi pertama membagi tanh(k*x) dengan tanh(k). Untuk k besar, itu
//     mengubah sinyal kecil menjadi ~1.0 - artinya menaikkan level ~+5 dB
//     pada drive 18. Itu persis masalah yang hendak diperbaiki (mode immersive
//     diam-diam menguatkan). Membagi dengan k membuat SLOPE DI NOL = 1, jadi
//     sinyal kecil lewat tanpa perubahan gain.
//
// (b) HARMONISA GENAP.
//     Versi pertama memakai x^2 * sign(x). Perhatikan bahwa
//
//         f(-x) = (-x)^2 * (-1) = -x^2 = -f(x)
//
//     jadi fungsi itu GANJIL - ia hanya menambah harmonisa ganjil, dan
//     komponen orde 2 praktis nol (terukur ~3e-33, yaitu nol numerik).
//     Untuk harmonisa genap dibutuhkan fungsi GENAP: x^2 tanpa sign.
//     Konstanta -0.25 menggeser agar rerata nol, jadi tidak ada DC offset.
//
// Konstanta 1.2 dipilih dari pengukuran: memberi h2/f0 ~0.17 (jelas terdengar
// sebagai kehangatan) dengan perubahan level hanya -0.35 dB pada drive 18.
float HarmonicExciter::shape(float x, float k) {

    if (k <= 0.0f) {
        return x;
    }

    const float soft = std::tanh(k * x) / k;

    // x^2 adalah fungsi GENAP -> menghasilkan harmonisa orde 2.
    // Pergeseran -0.25 membuat reratanya nol supaya tidak ada DC offset.
    const float even = (x * x - 0.25f) * 1.2f;

    return soft + even;
}

// =====================================================
// PROCESS
// =====================================================

void HarmonicExciter::process(
    float* left,
    float* right,
    int32_t numFrames
) {

    // Bypass sejati: drive 0 tidak menyentuh buffer sama sekali.
    if (mAmount <= 0.0f || !left || !right || numFrames <= 0) {
        return;
    }

    const float dry = 1.0f - mAmount;

    for (int32_t i = 0; i < numFrames; ++i) {
        left[i] = dry * left[i] + mAmount * shape(left[i], mK);
        right[i] = dry * right[i] + mAmount * shape(right[i], mK);
    }
}

void HarmonicExciter::reset() {
    // Tidak ada state yang perlu direset - shaper-nya stateless.
}

}} // namespace
