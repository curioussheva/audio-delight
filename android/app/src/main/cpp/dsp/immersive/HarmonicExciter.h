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
//
// 🔥 FIX (2026-11-11, DSP-M3): shaper di bawah menyuntik DC offset yang
// bergantung level (suku genap 1.2*(x^2-0.25) hanya zero-mean saat RMS=0.5).
// Kelas ini sekarang punya DC blocker satu-pole (highpass ~10 Hz) yang
// berjalan pada output campuran di process() - jadi shaper-nya tetap
// stateless, tapi kelasnya ber-state (state blocker di-reset di reset() dan
// di prepare()). Bypass drive 0 tetap bit-exact (return dini, blocker tidak
// jalan).
class HarmonicExciter {
public:
    HarmonicExciter();

    void setDrive(float driveDb); // 0-24 dB
    void prepare(int32_t sampleRate); // laju stream, untuk koefisien DC blocker
    void process(float* left, float* right, int32_t numFrames);
    void reset();

private:
    // Shaper nonlinear, tanpa state.
    static float shape(float x, float k);

    // DC blocker satu-pole: y = x - prevIn + R*prevOut (R dari laju, ~10 Hz).
    float dcBlock(float x, float& prevIn, float& prevOut) const;

    float mDrive = 0.0f;

    // Cache, dihitung di setter - bukan tiap buffer.
    float mAmount = 0.0f; // 0..1: seberapa banyak harmonisa dicampur
    float mK = 1.0f;      // ketajaman kurva

    // DC blocker: koefisien R = exp(-2*pi*10/fs), default ~10 Hz @48 kHz.
    float mDcCoeff = 0.99869f;
    float mDcPrevInL = 0.0f;
    float mDcPrevOutL = 0.0f;
    float mDcPrevInR = 0.0f;
    float mDcPrevOutR = 0.0f;
};

}} // namespace
