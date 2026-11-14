// =====================================================
// dsp/EQProcessor.cpp
// Production Modular EQ Processor
// =====================================================

#include "EQProcessor.h"

#include <cmath>

namespace pristine {

// =====================================================
// PREPARE
// =====================================================

void EQProcessor::prepare(
    int sampleRate
) noexcept {

    mSampleRate =
        static_cast<float>(
            sampleRate
        );

    for (
        int i = 0;
        i < kBands;
        ++i
    ) {

        updateBand(i);
    }

    updateBass();

    // (C-SMOOTH): samakan koefisien hidup dengan target — prepare() bukan
    // tempat menyapu: perilaku startup identik dengan dulu (koefisien
    // langsung terpasang), sapuan hanya untuk perubahan sesudahnya.
    snapCoefficients();

    reset();
}

// =====================================================
// RESET
// =====================================================

void EQProcessor::reset() noexcept {

    for (
        int i = 0;
        i < kBands;
        ++i
    ) {

        mLeft[i].reset();
        mRight[i].reset();
    }

    mBassLeft.reset();
    mBassRight.reset();
}

// =====================================================
// PROCESS
// =====================================================

void EQProcessor::process(
    float* left,
    float* right,
    int32_t frames
) noexcept {

    for (
        int32_t i = 0;
        i < frames;
        ++i
    ) {

        // (C-SMOOTH): satu langkah one-pole koefisien sebelum sample ini
        // diproses — hanya bila ada band/bass yang masih menyapu.
        if (mSmoothingMask != 0) {
            smoothCoefficientsStep();
        }

        float l = left[i];
        float r = right[i];

        // =========================================
        // PARAMETRIC EQ
        // =========================================

        for (
            int b = 0;
            b < kBands;
            ++b
        ) {

            if (!mBandEnabled[b]) {
                continue;
            }

            l =
                mLeft[b]
                    .process(l);

            r =
                mRight[b]
                    .process(r);
        }

        // =========================================
        // BASS BOOST
        // =========================================

        if (mBassEnabled) {

            l =
                mBassLeft.process(l);

            r =
                mBassRight.process(r);
        }

        left[i] = l;
        right[i] = r;
    }
}

// =====================================================
// SET BAND GAIN
// =====================================================

void EQProcessor::setBandGain(
    int band,
    float gainDb
) noexcept {

    if (
        band < 0 ||
        band >= kBands
    ) {
        return;
    }

    // 🔥 FIX (2026-10-10, realtime): jangan hitung ulang koefisien kalau nilai
    // tidak berubah.
    //
    // `updateBand()` memanggil fungsi desain BiquadFilter (setPeakingEQ /
    // setLowShelf / setHighShelf) yang memakai powf/cosf/sinf. Sejak EQ
    // tersambung ke jalur produksi, `applyConfig()` dipanggil TIAP BUFFER
    // (~25x/detik) — tanpa guard ini, 10 band × 3 fungsi transendental
    // berjalan terus-menerus di audio thread hanya untuk nilai yang sama.
    // Dengan guard, trig hanya jalan saat user benar-benar menggeser slider
    // atau memuat preset.
    //
    // Perbandingan float di sini aman: nilainya berasal dari slider yang
    // sudah dibulatkan, bukan hasil akumulasi.
    if (mBandGain[band] == gainDb) {
        return;
    }

    mBandGain[band] =
        gainDb;

    mBandEnabled[band] =
        std::fabs(gainDb)
        > 0.001f;

    updateBand(band);
}

// =====================================================
// SET BASS BOOST
// =====================================================

void EQProcessor::setBassBoost(
    float gainDb
) noexcept {

    // �� FIX (2026-10-10, realtime): sama seperti setBandGain — `updateBass()`
    // memakai trig, dan `applyConfig()` dipanggil tiap buffer. Tanpa guard,
    // koefisien bass dihitung ulang terus untuk nilai yang sama.
    if (mBassBoost == gainDb) {
        return;
    }

    mBassBoost =
        gainDb;

    mBassEnabled =
        std::fabs(gainDb)
        > 0.001f;

    updateBass();
}

// =====================================================
// SET ALL FLAT
// =====================================================

void EQProcessor::setAllFlat() noexcept {

    for (
        int i = 0;
        i < kBands;
        ++i
    ) {

        setBandGain(
            i,
            0.0f
        );
    }

    setBassBoost(0.0f);
}

// =====================================================
// UPDATE BAND
// =====================================================

void EQProcessor::updateBand(
    int band
) noexcept {

    BiquadFilter filter;

    // (EQ-SHELF, 2026-11-14): konvensi AutoEQ/Squiglink — shelf di ujung,
    // peaking di tengah. Band 0 (31 Hz) lowshelf dan band 9 (16 kHz)
    // highshelf, Q 0.707 (tanpa overshoot); band 1–8 peaking Q 1.414.
    // Sama seperti headphone correction (PresetParser/BiquadCascade), jadi
    // EQ manual dan koreksi headphone satu arah. Dulu semua band peaking,
    // padahal `EQ_BAND_TYPES` di TS sudah mengklaim LS/HS di ujung.
    if (band == 0) {
        filter.setLowShelf(
            kBandFreqs[band],
            0.707f,
            mBandGain[band],
            mSampleRate
        );
    } else if (band == kBands - 1) {
        filter.setHighShelf(
            kBandFreqs[band],
            0.707f,
            mBandGain[band],
            mSampleRate
        );
    } else {
        filter.setPeakingEQ(
            kBandFreqs[band],
            1.414f,
            mBandGain[band],
            mSampleRate
        );
    }

    const auto coeffs =
        filter.getCoefficients();

    // (C-SMOOTH): tulis TARGET saja, bukan koefisien hidup — koefisien
    // hidup didekati per sample di smoothCoefficientsStep(). Tandai
    // menyapu hanya bila live memang berbeda (kalau sama, mask tetap 0
    // dan tidak ada biaya per sample).
    mTargetCoeffs[band] = coeffs;

    if (
        !coeffsSettled(
            mLeft[band].getCoefficients(),
            coeffs
        )
    ) {
        mSmoothingMask |= (1u << band);
    }
}

// =====================================================
// UPDATE BASS
// =====================================================

void EQProcessor::updateBass() noexcept {

    BiquadFilter filter;

    filter.setLowShelf(
        100.0f,
        0.707f,
        mBassBoost,
        mSampleRate
    );

    const auto coeffs =
        filter.getCoefficients();

    // (C-SMOOTH): sama seperti updateBand — target saja, hidup menyusul
    // per sample.
    mTargetBass = coeffs;

    if (
        !coeffsSettled(
            mBassLeft.getCoefficients(),
            coeffs
        )
    ) {
        mSmoothingMask |= kBassBit;
    }
}

// =====================================================
// SMOOTHING KOEFISIEN (C-SMOOTH)
// =====================================================

bool EQProcessor::coeffsSettled(
    const BiquadCoefficients& a,
    const BiquadCoefficients& b
) noexcept {

    return
        std::fabs(a.b0 - b.b0) <= kSettledEps &&
        std::fabs(a.b1 - b.b1) <= kSettledEps &&
        std::fabs(a.b2 - b.b2) <= kSettledEps &&
        std::fabs(a.a1 - b.a1) <= kSettledEps &&
        std::fabs(a.a2 - b.a2) <= kSettledEps;
}

bool EQProcessor::stepCoefficients(
    BiquadCoefficients& cur,
    const BiquadCoefficients& target
) noexcept {

    // Struktur cabang yang sama dengan SpatialFieldProcessor::process():
    // di dalam ambang, terapkan selisih penuh (snap); di luar ambang,
    // langkah kSmooth. (B13-K2-double: langkah dalam double supaya
    // koefisien tidak terkuantisasi float di tiap langkah sapuan.)
    const auto step =
        [](double c, double t) {

            return
                std::fabs(t - c) > kSettledEps
                    ? c + (t - c) * kSmooth
                    : t;
        };

    cur.b0 = step(cur.b0, target.b0);
    cur.b1 = step(cur.b1, target.b1);
    cur.b2 = step(cur.b2, target.b2);
    cur.a1 = step(cur.a1, target.a1);
    cur.a2 = step(cur.a2, target.a2);

    if (coeffsSettled(cur, target)) {
        cur = target;
        return true;
    }

    return false;
}

void EQProcessor::smoothCoefficientsStep() noexcept {

    for (
        int b = 0;
        b < kBands;
        ++b
    ) {

        if ((mSmoothingMask & (1u << b)) == 0) {
            continue;
        }

        // L dan R selalu memakai koefisien yang sama: hitung sekali,
        // pasang ke keduanya. setCoefficients hanya assign (tidak
        // menyentuh state z1/z2), jadi aman per sample.
        BiquadCoefficients cur =
            mLeft[b].getCoefficients();

        if (
            stepCoefficients(
                cur,
                mTargetCoeffs[b]
            )
        ) {
            mSmoothingMask &= ~(1u << b);
        }

        mLeft[b].setCoefficients(cur);
        mRight[b].setCoefficients(cur);
    }

    if ((mSmoothingMask & kBassBit) != 0) {

        BiquadCoefficients cur =
            mBassLeft.getCoefficients();

        if (
            stepCoefficients(
                cur,
                mTargetBass
            )
        ) {
            mSmoothingMask &= ~kBassBit;
        }

        mBassLeft.setCoefficients(cur);
        mBassRight.setCoefficients(cur);
    }
}

void EQProcessor::snapCoefficients() noexcept {

    for (
        int b = 0;
        b < kBands;
        ++b
    ) {

        mLeft[b].setCoefficients(mTargetCoeffs[b]);
        mRight[b].setCoefficients(mTargetCoeffs[b]);
    }

    mBassLeft.setCoefficients(mTargetBass);
    mBassRight.setCoefficients(mTargetBass);

    mSmoothingMask = 0;
}

} // namespace pristine