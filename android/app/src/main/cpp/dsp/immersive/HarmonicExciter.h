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
// Kelas ini sekarang punya DC blocker satu-pole (highpass ~50 Hz) yang
// berjalan HANYA pada produk distorsi (h = shape(x) - x) di process() -
// jadi shaper-nya tetap stateless, tapi kelasnya ber-state (state blocker
// di-reset di reset() dan di prepare()). Sinyal dry TIDAK lewat blocker,
// jadi bass sinyal asli tidak terpotong blocker. Bypass drive 0 tetap
// bit-exact (return dini, blocker tidak jalan).
//
// B15-I2 (2026-11-15): sebelumnya blocker dilewati SELURUH campuran
// dry+wet, sehingga bass 40 Hz sinyal asli turun ~0,26 dB dan DC sumber
// ikut dibuang. Sekarang hanya h yang diblokir; out = x + amount*dcBlock(h).
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

    // DC blocker satu-pole: y = x - prevIn + R*prevOut (R dari laju, ~50 Hz).
    // B15-I2: hanya dilewati produk distorsi (shape(x) - x), bukan dry.
    // I1-double: koefisien + state double — di 384 kHz R = 0,99918,
    // selisih 1-R ~8e-4: float masih bisa, tapi double menghilangkan
    // kuantisasi koefisien/state sepenuhnya (murah, satu-pole).
    // Input/output tetap float (jalur audio), seperti BiquadFilter.
    float dcBlock(double x, double& prevIn, double& prevOut) const;

    float mDrive = 0.0f;

    // Cache, dihitung di setter - bukan tiap buffer.
    float mAmount = 0.0f; // 0..1: seberapa banyak harmonisa dicampur
    float mK = 1.0f;      // ketajaman kurva

    // DC blocker: koefisien R = exp(-2*pi*50/fs), default ~50 Hz @48 kHz.
    // Satu state (prevIn/prevOut) per channel; keduanya hanya menyimpan
    // riwayat produk distorsi h = shape(x) - x, bukan sinyal campuran.
    // I1-double: koefisien + state double (lihat dcBlock).
    double mDcCoeff = 0.9934763870659812;
    double mDcPrevInL = 0.0;
    double mDcPrevOutL = 0.0;
    double mDcPrevInR = 0.0;
    double mDcPrevOutR = 0.0;
};

}} // namespace
