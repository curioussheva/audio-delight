// =====================================================
// dsp/EQProcessor.h
// Production Modular EQ Processor
// =====================================================

#pragma once

#include <cstdint>

#include "BiquadFilter.h"

namespace pristine {

// =====================================================
// 10-BAND PARAMETRIC EQ
// =====================================================

class EQProcessor {
public:

    static constexpr int kBands = 10;

    // =============================================
    // LIFECYCLE
    // =============================================

    void prepare(
        int sampleRate
    ) noexcept;

    void reset() noexcept;

    // =============================================
    // PROCESS
    // =============================================

    void process(
        float* left,
        float* right,
        int32_t frames
    ) noexcept;

    // =============================================
    // CONTROL
    // =============================================

    void setBandGain(
        int band,
        float gainDb
    ) noexcept;

    void setBassBoost(
        float gainDb
    ) noexcept;

    void setAllFlat() noexcept;

private:

    // =============================================
    // INTERNAL
    // =============================================

    void updateBand(
        int band
    ) noexcept;

    void updateBass() noexcept;

    // =============================================
    // SMOOTHING KOEFISIEN (C-SMOOTH, 2026-11-12)
    // =============================================
    //
    // Dulu updateBand()/updateBass() langsung menimpa koefisien hidup
    // biquad — perubahan EQ (tiap buffer bila berubah, lewat dedup
    // AudioPipeline::applyDSPConfig) melompat seketika: zipper noise
    // saat slider/preset digeser, plus transien step-response dari
    // state z1/z2 yang dihitung dengan koefisien lama.
    //
    // Sekarang update*() hanya menulis TARGET; koefisien hidup didekati
    // per sample dengan one-pole (kSmooth = 0,002f — sama dengan
    // SpatialFieldProcessor dan GainNode). Satu langkah per sample
    // dihitung sekali per band lalu dipakai L dan R (koefisien keduanya
    // selalu identik). Nilai akhir TIDAK berubah: begitu sampai, koefisien
    // persis target (snap), dan prepare() men-snap semuanya supaya
    // perilaku startup identik dengan dulu.
    //
    // (B14-E1, 2026-11-14): mask sapuan menyala pada perubahan koefisien
    // APA PUN (coeffsEqual, perbandingan eksak) — bukan bila selisihnya
    // melewati ambang. Dulu ambang 1e-4f menelan langkah gain kecil:
    // selisih koefisien shelf 31 Hz menyusut sebanding w0 = 2π·fc/fs,
    // jadi di 192 kHz langkah 2,0 dB pun tidak pernah dipasang, dan di
    // 48 kHz langkah 0,25–0,5 dB sudah hilang (harness
    // scripts/test_eq_small_steps.cpp). Ambang snap yang terpisah,
    // kCoeffSnapEps = 1e-9, dipakai HANYA untuk memutuskan kapan sapuan
    // selesai (koefisien double; 1e-3 -> 1e-9 dalam ~7000 sampel).
    //
    // Aman: band hanya mengubah gainDb (freq/Q tetap), jadi interpolasi
    // linear antara dua set koefisien stabil berada di dalam segitiga
    // stabilitas biquad (daerah stabil cembung di (a1, a2)) — titik
    // antara tidak pernah keluar dari stabil.
    //
    // Biaya: nol saat sudah settle (mask == 0, satu branch per sample).
    // Selama transisi: ≤11 band × 5 koefisien lerp + 2× setCoefficients
    // per sample, tanpa trig (trig hanya sekali saat target dihitung)
    // dan tanpa alokasi.

    // Satu langkah one-pole untuk satu set koefisien. Mengembalikan true
    // bila sesudah langkah ini semua koefisien sudah dalam ambang —
    // dalam hal itu `cur` di-snap persis ke `target`.
    static bool stepCoefficients(
        BiquadCoefficients& cur,
        const BiquadCoefficients& target
    ) noexcept;

    static bool coeffsSettled(
        const BiquadCoefficients& a,
        const BiquadCoefficients& b
    ) noexcept;

    // (B14-E1): perbandingan eksak — true hanya bila kelima koefisien
    // sama persis. Dipakai updateBand()/updateBass() untuk memutuskan
    // mask sapuan: perubahan sekecil apa pun harus menyalakan sapuan,
    // karena selisih koefisien shelf di laju tinggi sangat kecil.
    static bool coeffsEqual(
        const BiquadCoefficients& a,
        const BiquadCoefficients& b
    ) noexcept;

    // Satu langkah smoothing untuk semua band/bass yang masih aktif.
    // Dipanggil sekali per sample dari process(), hanya bila mask != 0.
    void smoothCoefficientsStep() noexcept;

    // Samakan koefisien hidup dengan target seketika + bersihkan mask.
    // Dipakai prepare() supaya startup tidak menyapu.
    void snapCoefficients() noexcept;

    static constexpr float kSmooth = 0.002f;

    // (B14-E1): ambang snap untuk koefisien double — dipakai
    // stepCoefficients()/coeffsSettled() saja. JANGAN dipakai untuk
    // memutuskan mask sapuan (lihat coeffsEqual di atas): ambang 1e-4
    // yang lama menelan langkah gain kecil di laju tinggi.
    static constexpr double kCoeffSnapEps = 1e-9;

    // Bit kBassBit di mSmoothingMask = bass boost masih menyapu.
    static constexpr uint32_t kBassBit = (1u << kBands);

private:

    // =============================================
    // FILTERS
    // =============================================

    alignas(64)
    BiquadFilter mLeft[kBands];

    alignas(64)
    BiquadFilter mRight[kBands];

    BiquadFilter mBassLeft;
    BiquadFilter mBassRight;

    // =============================================
    // PARAMETERS
    // =============================================

    float mSampleRate = 48000.0f;

    float mBandGain[kBands] = {
        0.0f
    };

    float mBassBoost = 0.0f;

    // =============================================
    // TARGET KOEFISIEN (C-SMOOTH)
    // =============================================
    //
    // Koefisien tujuan dari updateBand()/updateBass(). Koefisien hidup
    // di dalam BiquadFilter didekati per sample menuju nilai ini; L dan R
    // selalu memakai set yang sama.
    BiquadCoefficients mTargetCoeffs[kBands];

    BiquadCoefficients mTargetBass;

    // Bitmask band/bass yang koefisiennya masih menyapu (bit b = band b,
    // bit kBassBit = bass). 0 = semua sudah di target.
    uint32_t mSmoothingMask = 0;

    // =============================================
    // OPTIMIZATION FLAGS
    // =============================================

    bool mBandEnabled[kBands] = {
        false
    };

    bool mBassEnabled = false;

    // =============================================
    // CONSTANTS
    // =============================================

    static constexpr float kBandFreqs[kBands] = {
        31.0f,
        62.0f,
        125.0f,
        250.0f,
        500.0f,
        1000.0f,
        2000.0f,
        4000.0f,
        8000.0f,
        16000.0f
    };
};

} // namespace pristine 