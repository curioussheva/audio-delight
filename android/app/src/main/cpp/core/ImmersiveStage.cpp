// =====================================================
// core/ImmersiveStage.cpp
// =====================================================

#include "ImmersiveStage.h"

namespace pristine {

// =====================================================
// FREQUENCY -> BRAINWAVE BAND
// =====================================================
//
// Batas band psikoakustik standar. Dipakai untuk menerjemahkan brainwaveFreq
// (Hz) menjadi tipe binaural beat.
dsp::BrainwaveType ImmersiveStage::mapFrequencyToBrainwaveType(float hz) {

    if (hz < 4.0f)  return dsp::BrainwaveType::DELTA;
    if (hz < 8.0f)  return dsp::BrainwaveType::THETA;
    if (hz < 13.0f) return dsp::BrainwaveType::ALPHA;
    if (hz < 30.0f) return dsp::BrainwaveType::BETA;

    return dsp::BrainwaveType::GAMMA;
}

// =====================================================
// PREPARE
// =====================================================

void ImmersiveStage::prepare(int32_t sampleRate) {

    if (sampleRate <= 0) {
        return;
    }

    mSampleRate = sampleRate;

    // Hanya Solfeggio yang butuh laju: ia menghitung koefisien filter dari
    // frekuensi target relatif terhadap sample rate. Yang lain tidak stateful
    // terhadap laju (brainwave menerimanya per panggilan).
    mSolfeggio.prepare(sampleRate);

    mPrepared = true;
}

// =====================================================
// PROCESS
// =====================================================
//
// Urutan tahap disengaja:
//
//   Solfeggio -> Harmonic -> Spatial -> Brainwave
//
// Resonansi lebih dulu supaya harmonisa yang ditambahkan exciter ikut
// memperkaya resonansinya, bukan sebaliknya (exciter sebelum filter resonan
// akan menghasilkan harmonisa yang lalu diredam). Spatial setelah keduanya
// supaya pelebaran stereo ikut menyebarkan hasilnya. Brainwave terakhir karena
// ia MENAMBAHKAN sinyal, bukan memproses yang ada - menambahkan beat lebih awal
// akan ikut terdistorsi exciter.
void ImmersiveStage::process(
    float* left,
    float* right,
    int32_t numFrames,
    const DSPParameters& params
) {

    if (!mPrepared || !left || !right || numFrames <= 0) {
        // Belum prepare (stream belum dibuka) = lewatkan tanpa memproses.
        // Lebih baik audio keluar tanpa efek immersive daripada tidak keluar.
        return;
    }

    // ---- 1. Solfeggio resonance -------------------------------------------

    mSolfeggio.setFrequency(params.solfeggioFreq);
    mSolfeggio.setIntensity(params.resonanceIntensity);

    mSolfeggio.process(left, right, numFrames);

    // ---- 2. Harmonic exciter ----------------------------------------------
    //
    // Drive diturunkan dari intensitas resonansi: intensitas 0 = tanpa efek,
    // supaya slider yang sama mengendalikan seluruh karakter immersive.
    // Maksimum 12 dB (bukan 24) supaya tidak mendominasi sinyal sumber.
    mHarmonic.setDrive(params.resonanceIntensity * 12.0f);

    mHarmonic.process(left, right, numFrames);

    // ---- 3. Spatial field --------------------------------------------------

    mSpatial.setWidth(params.stereoWidth);
    mSpatial.setDepth(params.resonanceIntensity * 0.5f);

    mSpatial.process(left, right, numFrames);

    // ---- 4. Brainwave generator -------------------------------------------
    //
    // brainwaveFreq 0 = tidak ada binaural beat. Volume diikat ke intensitas
    // resonansi supaya satu kontrol menaikkan/menurunkan seluruh efek.
    if (params.brainwaveFreq > 0.0f) {
        mBrainwave.setType(
            mapFrequencyToBrainwaveType(params.brainwaveFreq)
        );

        mBrainwave.setVolume(params.resonanceIntensity);

        mBrainwave.generate(
            left,
            right,
            numFrames,
            static_cast<float>(mSampleRate)
        );
    }
}

// =====================================================
// RESET
// =====================================================

void ImmersiveStage::reset() {

    mSolfeggio.reset();
    mBrainwave.reset();
    mHarmonic.reset();
    mSpatial.reset();
    mBinaural.reset();
}

} // namespace pristine
