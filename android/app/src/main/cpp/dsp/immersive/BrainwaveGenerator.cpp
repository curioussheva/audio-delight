#include "BrainwaveGenerator.h"

#include <cmath>

namespace pristine { namespace dsp {

namespace {

// Frekuensi carrier. 200 Hz dipilih karena:
//   - cukup rendah agar beat-nya terasa jelas,
//   - cukup tinggi agar tidak terasa seperti drone bass,
//   - masih jauh dari batas atas pendengaran pada semua laju sampling.
constexpr double kCarrierHz = 200.0;

// Amplitudo dasar carrier. Sengaja kecil (0.08) supaya ia menjadi lapisan
// halus di bawah musik. Kalau terlalu besar, yang terdengar justru nadanya,
// bukan efeknya.
constexpr double kCarrierAmplitude = 0.08;

constexpr double kTwoPi = 6.283185307179586;

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
    const double amplitude = kCarrierAmplitude * static_cast<double>(vol);

    const double beatHz = static_cast<double>(beatFrequency(mType));

    // Setengah beat di kiri, setengah di kanan. Selisih keduanya = beatHz,
    // sehingga otak mempersepsikan denyut sebesar beatHz.
    const double leftHz = kCarrierHz - beatHz * 0.5;
    const double rightHz = kCarrierHz + beatHz * 0.5;

    const double incL = kTwoPi * leftHz / static_cast<double>(sampleRate);
    const double incR = kTwoPi * rightHz / static_cast<double>(sampleRate);

    for (int32_t i = 0; i < numFrames; ++i) {

        left[i] += static_cast<float>(std::sin(mPhaseL) * amplitude);
        right[i] += static_cast<float>(std::sin(mPhaseR) * amplitude);

        mPhaseL += incL;
        mPhaseR += incR;

        // Bungkus fase supaya tidak tumbuh tanpa batas. Dengan double,
        // presisi kabur baru di sekitar 1e15 — praktis tidak pernah
        // tercapai; bungkus tetap dijaga supaya fase tetap bounded.
        if (mPhaseL >= kTwoPi) mPhaseL -= kTwoPi;
        if (mPhaseR >= kTwoPi) mPhaseR -= kTwoPi;
    }
}

void BrainwaveGenerator::reset() {
    mPhaseL = 0.0;
    mPhaseR = 0.0;
}

}} // namespace
