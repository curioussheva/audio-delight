#pragma once
#include <cstdint>

namespace pristine { namespace dsp {

// =====================================================
// HARMONIC EXCITER
// =====================================================
//
// Membangkitkan harmonisa orde dua dan tiga dari sinyal sumber (nonlinear
// waveshaping), lalu mencampurkannya kembali pada level yang dikendalikan
// `drive`.
//
// Sebelumnya kelas ini hanya mengalikan buffer dengan gain linear. Artinya
// "exciter" hanyalah penguat: mode Immersive terdengar lebih keras, bukan
// lebih kaya - dan itu menyesatkan, karena namanya menjanjikan harmonisa.
//
// Prinsip: kurva nonlinear halus menghasilkan harmonisa yang menurun cepat
// pada orde tinggi, jadi tidak harsh. Dipakai pendekatan soft
// diode-like shaper, bukan hard clipping, supaya distorsinya tetap musikal
// pada drive tinggi.
//
// Drive 0 = benar-benar bypass (tanpa harmonisa, tanpa perubahan gain).
class HarmonicExciter {
public:
    HarmonicExciter();

    void setDrive(float driveDb); // 0-24 dB
    void process(float* left, float* right, int32_t numFrames);
    void reset();

private:
    // Shaper nonlinear, tanpa state.
    static float shape(float x, float k);

    float mDrive = 0.0f;

    // Cache, dihitung di setter - bukan tiap buffer.
    float mAmount = 0.0f; // 0..1: seberapa banyak harmonisa dicampur
    float mK = 1.0f;      // ketajaman kurva
};

}} // namespace
