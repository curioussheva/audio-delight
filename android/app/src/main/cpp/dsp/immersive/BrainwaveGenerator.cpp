#include "BrainwaveGenerator.h"

#include <cmath>

namespace pristine { namespace dsp {

namespace {

// Frekuensi carrier. 200 Hz dipilih karena:
//   - cukup rendah agar beat-nya terasa jelas,
//   - cukup tinggi agar tidak terasa seperti drone bass,
//   - masih jauh dari batas atas pendengaran pada semua laju sampling.
constexpr float kCarrierHz = 200.0f;

// Amplitudo dasar carrier. Sengaja kecil (0.08) supaya ia menjadi lapisan
// halus di bawah musik. Kalau terlalu besar, yang terdengar justru nadanya,
// bukan efeknya.
constexpr float kCarrierAmplitude = 0.08f;

constexpr float kTwoPi = 6.28318530718f;

} // namespace

BrainwaveGenerator::BrainwaveGenerator() = default;

void BrainwaveGenerator::setType(BrainwaveType type) {
    mType = type;
}

void BrainwaveGenerator::setVolume(float volume) {
    mVolume = volume;
}

// =====================================================
// BEAT FREQUENCY
// =====================================================
//
// Frekuensi beat khas tiap band (selisih antar channel):
//
//   DELTA  2.5 Hz  - tidur dalam
//   THETA  6.0 Hz  - meditasi / kantuk
//   ALPHA 10.0 Hz  - rileks, terjaga
//   BETA  18.0 Hz  - fokus / waspada
//   GAMMA 40.0 Hz  - kognisi tinggi
//
// Nilai di tengah band dipilih supaya tidak bertumpuk dengan band tetangga.
float BrainwaveGenerator::beatFrequency(BrainwaveType type) {

    switch (type) {
        case BrainwaveType::DELTA: return 2.5f;
        case BrainwaveType::THETA: return 6.0f;
        case BrainwaveType::ALPHA: return 10.0f;
        case BrainwaveType::BETA:  return 18.0f;
        case BrainwaveType::GAMMA: return 40.0f;
    }

    return 10.0f;
}

// =====================================================
// GENERATE
// =====================================================
//
// MENAMBAHKAN ke buffer, bukan menggantinya. Ini perbedaan yang menentukan:
// versi lama menolkan buffer, sehingga mengaktifkan immersive dengan
// brainwaveFreq > 0 menghasilkan keheningan total.
//
// Phase accumulator: mPhaseL/mPhaseR adalah posisi dalam siklus (0..2pi).
// Nilai dibiarkan kontinu antar buffer - meresetnya tiap buffer akan
// menghasilkan diskontinuitas yang terdengar sebagai klik.
void BrainwaveGenerator::generate(
    float* left,
    float* right,
    int32_t numFrames,
    float sampleRate
) {

    if (!left || !right || numFrames <= 0 || sampleRate <= 0.0f) {
        return;
    }

    // Volume 0 = bypass, jangan sentuh buffer sama sekali.
    if (mVolume <= 0.0f) {
        return;
    }

    const float vol = mVolume > 1.0f ? 1.0f : mVolume;
    const float amplitude = kCarrierAmplitude * vol;

    const float beatHz = beatFrequency(mType);

    // Setengah beat di kiri, setengah di kanan. Selisih keduanya = beatHz,
    // sehingga otak mempersepsikan denyut sebesar beatHz.
    const float leftHz = kCarrierHz - beatHz * 0.5f;
    const float rightHz = kCarrierHz + beatHz * 0.5f;

    const float incL = kTwoPi * leftHz / sampleRate;
    const float incR = kTwoPi * rightHz / sampleRate;

    for (int32_t i = 0; i < numFrames; ++i) {

        left[i] += std::sin(mPhaseL) * amplitude;
        right[i] += std::sin(mPhaseR) * amplitude;

        mPhaseL += incL;
        mPhaseR += incR;

        // Bungkus fase supaya tidak tumbuh tanpa batas. Presisi float mulai
        // kabur di sekitar 1e7, dan pada 48 kHz itu tercapai dalam ~4 menit.
        if (mPhaseL >= kTwoPi) mPhaseL -= kTwoPi;
        if (mPhaseR >= kTwoPi) mPhaseR -= kTwoPi;
    }
}

void BrainwaveGenerator::reset() {
    mPhaseL = 0.0f;
    mPhaseR = 0.0f;
}

}} // namespace
