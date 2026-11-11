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
// PREPARE
// =====================================================
//
// Hitung koefisien DC blocker dari laju stream (cutoff ~10 Hz) dan bersihkan
// state-nya: stream baru harus mulai dari state bersih, bukan ekor stream
// lama. Bila prepare() tidak pernah dipanggil, mDcCoeff default (~10 Hz
// @48 kHz) tetap dipakai - blocker tetap jalan, hanya cutoff-nya sedikit
// meleset di laju lain.
void HarmonicExciter::prepare(int32_t sampleRate) {

    if (sampleRate > 0) {
        mDcCoeff = std::exp(
            -2.0f * static_cast<float>(M_PI) * 10.0f /
            static_cast<float>(sampleRate)
        );
    }

    mDcPrevInL = 0.0f;
    mDcPrevOutL = 0.0f;
    mDcPrevInR = 0.0f;
    mDcPrevOutR = 0.0f;
}

// =====================================================
// DC BLOCKER
// =====================================================
//
// One-pole highpass: y = x - prevIn + R*prevOut. Di DC (x konstan) output
// meluruh ke 0 dengan konstanta waktu ~1/(2*pi*10) detik; atenuasinya
// ~0.26 dB di 40 Hz, ~0.17 dB di 50 Hz, < 0.05 dB di atas ~100 Hz - jadi
// sinyal musik praktis tak tersentuh, hanya DC dan ayunan lambat (envelope)
// yang dibuang.
float HarmonicExciter::dcBlock(float x, float& prevIn, float& prevOut) const {

    const float y = x - prevIn + mDcCoeff * prevOut;

    prevIn = x;
    prevOut = y;

    return y;
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
//
//     ⚠️ KOREKSI (2026-11-11, DSP-M3): komentar lama di sini mengklaim
//     "Konstanta -0.25 menggeser agar rerata nol, jadi tidak ada DC offset"
//     - klaim itu SALAH. E[x^2 - 0.25] = E[x^2] - 0.25, dan E[x^2] = 0.25
//     hanya bila sinyal ber-RMS tepat 0.5. Di level lain suku genap
//     menyuntik DC = 1.2*(E[x^2]-0.25)*mAmount (terbukti harness: diam,
//     drive 6 dB -> DC -0.045; sine A=1.0 -> DC +0.135). DC itu DIBUANG oleh
//     DC blocker di process(), bukan oleh konstanta -0.25. Jangan hapus
//     blocker dengan alasan "-0.25 sudah menangani DC".
//
// Konstanta 1.2 dipilih dari pengukuran: memberi h2/f0 ~0.17 (jelas terdengar
// sebagai kehangatan) dengan perubahan level hanya -0.35 dB pada drive 18.
// (Catatan 2026-11-11: angka itu amplitudo-spesifik - terukur h2/f0 0.175
// baru cocok pada A~=0.5 dan jadi 0.404 pada A=1.0; level -1.87 dB pada
// A=0.5, -2.54 dB pada A=1.0. Jangan jadikan -0.35 dB sebagai sifat kelas.)
float HarmonicExciter::shape(float x, float k) {

    if (k <= 0.0f) {
        return x;
    }

    const float soft = std::tanh(k * x) / k;

    // x^2 adalah fungsi GENAP -> menghasilkan harmonisa orde 2.
    // (Pergeseran -0.25 TIDAK menghilangkan DC - lihat koreksi DSP-M3 di
    // atas. DC dibuang dcBlock() di process().)
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
        const float l =
            dry * left[i] + mAmount * shape(left[i], mK);
        const float r =
            dry * right[i] + mAmount * shape(right[i], mK);

        // DSP-M3: buang DC yang disuntik suku genap shape() (dan DC apa pun
        // dari sumber) sebelum keluar. Tanpa ini, output diam di drive 6 dB
        // adalah konstanta -0.045, bukan 0.
        left[i] = dcBlock(l, mDcPrevInL, mDcPrevOutL);
        right[i] = dcBlock(r, mDcPrevInR, mDcPrevOutR);
    }
}

void HarmonicExciter::reset() {
    // Shaper-nya stateless, tapi DC blocker ber-state - bersihkan supaya
    // tidak ada transient dari ekor track/stream sebelumnya.
    mDcPrevInL = 0.0f;
    mDcPrevOutL = 0.0f;
    mDcPrevInR = 0.0f;
    mDcPrevOutR = 0.0f;
}

}} // namespace
