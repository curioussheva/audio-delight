// =====================================================
// dsp/BiquadCascade.cpp
// =====================================================

#include "BiquadCascade.h"

#include <cmath>

namespace pristine {

// =====================================================
// CLEAR
// =====================================================

void BiquadCascade::clear() noexcept {

    mActive = 0;
    mOverflowed = false;

    mPreampDb = 0.0f;
    mPreampLinear = 1.0f;

    for (int i = 0; i < kMaxFilters; ++i) {

        mType[i] = FilterType::Peaking;
        mFreq[i] = 0.0f;
        mQ[i] = 0.707f;
        mGainDb[i] = 0.0f;

        mLeft[i].reset();
        mRight[i].reset();
    }
}

// =====================================================
// SET FILTER
// =====================================================

bool BiquadCascade::setFilter(
    int index,
    FilterType type,
    float freqHz,
    float q,
    float gainDb,
    float sampleRate
) noexcept {

    if (index < 0) {
        return false;
    }

    if (index >= kMaxFilters) {
        // Preset lebih panjang dari kapasitas. Dicatat, bukan didiamkan -
        // preset yang dipotong diam-diam adalah bentuk "mengaku jadi".
        mOverflowed = true;
        return false;
    }

    mType[index] = type;
    mFreq[index] = freqHz;
    mQ[index] = q;
    mGainDb[index] = gainDb;

    if (sampleRate > 0.0f) {
        mSampleRate = sampleRate;
    }

    BiquadFilter* fl = &mLeft[index];
    BiquadFilter* fr = &mRight[index];

    switch (type) {

        case FilterType::LowShelf:

            fl->setLowShelf(freqHz, q, gainDb, mSampleRate);
            fr->setLowShelf(freqHz, q, gainDb, mSampleRate);
            break;

        case FilterType::HighShelf:

            fl->setHighShelf(freqHz, q, gainDb, mSampleRate);
            fr->setHighShelf(freqHz, q, gainDb, mSampleRate);
            break;

        case FilterType::Peaking:
        default:

            fl->setPeakingEQ(freqHz, q, gainDb, mSampleRate);
            fr->setPeakingEQ(freqHz, q, gainDb, mSampleRate);
            break;
    }

    // Menambah filter otomatis menaikkan jumlah aktif, selama belum ada
    // `setActiveCount` eksplisit yang menurunkannya. Parser cukup memanggil
    // `setFilter` berurutan tanpa harus mengurus hitungan.
    if (index + 1 > mActive) {
        mActive = index + 1;
    }

    return true;
}

// =====================================================
// SET ACTIVE COUNT
// =====================================================

void BiquadCascade::setActiveCount(int count) noexcept {

    if (count < 0) {
        count = 0;
    }

    if (count > kMaxFilters) {
        count = kMaxFilters;
        mOverflowed = true;
    }

    mActive = count;
}

// =====================================================
// SET PREAMP
// =====================================================

void BiquadCascade::setPreamp(float gainDb) noexcept {

    mPreampDb = gainDb;
    mPreampLinear = powf(10.0f, gainDb / 20.0f);
}

// =====================================================
// SET SAMPLE RATE
// =====================================================
//
// Hitung ulang koefisien seluruh filter aktif dengan laju baru. Dipanggil
// saat stream dibuka dengan laju AKTUAL (bisa 44100, 96000, dst) - bukan
// yang diminta. Inilah yang membuat koreksi berlaku di laju apa pun,
// berbeda dari `.vdc` Viper yang menyimpan koefisien statis untuk 44.1k/48k.
void BiquadCascade::setSampleRate(float sampleRate) noexcept {

    if (sampleRate <= 0.0f) {
        return;
    }

    mSampleRate = sampleRate;

    for (int i = 0; i < mActive; ++i) {

        BiquadFilter* fl = &mLeft[i];
        BiquadFilter* fr = &mRight[i];

        switch (mType[i]) {

            case FilterType::LowShelf:
                fl->setLowShelf(mFreq[i], mQ[i], mGainDb[i], mSampleRate);
                fr->setLowShelf(mFreq[i], mQ[i], mGainDb[i], mSampleRate);
                break;

            case FilterType::HighShelf:
                fl->setHighShelf(mFreq[i], mQ[i], mGainDb[i], mSampleRate);
                fr->setHighShelf(mFreq[i], mQ[i], mGainDb[i], mSampleRate);
                break;

            case FilterType::Peaking:
            default:
                fl->setPeakingEQ(mFreq[i], mQ[i], mGainDb[i], mSampleRate);
                fr->setPeakingEQ(mFreq[i], mQ[i], mGainDb[i], mSampleRate);
                break;
        }
    }
}

// =====================================================
// PROCESS
// =====================================================
//
// Berjalan di audio thread: nol alokasi, nol lock, nol cabang per sample
// selain loop filter. Preamp diterapkan lebih dulu supaya cascade selalu
// menerima sinyal yang sudah punya headroom.
void BiquadCascade::process(
    float* left,
    float* right,
    int32_t numFrames
) noexcept {

    if (!left || !right || numFrames <= 0) {
        return;
    }

    if (mActive <= 0 && mPreampLinear == 1.0f) {
        // Tidak ada yang dikonfigurasi: jangan sentuh buffer sama sekali.
        return;
    }

    const int n = mActive;
    const float pre = mPreampLinear;

    for (int32_t i = 0; i < numFrames; ++i) {

        float l = left[i] * pre;
        float r = right[i] * pre;

        for (int f = 0; f < n; ++f) {
            l = mLeft[f].process(l);
            r = mRight[f].process(r);
        }

        left[i] = l;
        right[i] = r;
    }
}

// =====================================================
// RESET
// =====================================================

void BiquadCascade::reset() noexcept {

    for (int i = 0; i < kMaxFilters; ++i) {
        mLeft[i].reset();
        mRight[i].reset();
    }
}

} // namespace pristine
