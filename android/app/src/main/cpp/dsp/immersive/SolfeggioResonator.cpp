#include "SolfeggioResonator.h"

#include <algorithm>
#include <cmath>

namespace pristine {
namespace dsp {

SolfeggioResonator::SolfeggioResonator() = default;

void SolfeggioResonator::prepare(int32_t sampleRate) {
    if (sampleRate > 0) mSampleRate = static_cast<float>(sampleRate);
}

void SolfeggioResonator::setFrequency(float hz) {
    mFreq.store(std::max(20.0f, hz), std::memory_order_relaxed);
}

void SolfeggioResonator::setIntensity(float intensity) {
    mIntensity.store(std::clamp(intensity, 0.0f, 1.0f), std::memory_order_relaxed);
}

// Recompute hanya saat freq/intensity berubah — real-time safe, tidak ada
// trig/alloc/lock per-sample.
void SolfeggioResonator::updateCoefficientsIfNeeded() {
    const float freq = mFreq.load(std::memory_order_relaxed);
    const float intensity = mIntensity.load(std::memory_order_relaxed);

    if (freq == mCachedFreq && intensity == mCachedIntensity) return;

    mCachedFreq = freq;
    mCachedIntensity = intensity;

    // Intensity tinggi -> band lebih sempit -> resonansi terasa lebih kuat.
    const float Q = 0.7f + intensity * 7.3f;

    const float w0 = 2.0f * static_cast<float>(M_PI) * freq / mSampleRate;
    const float cosW0 = cosf(w0);
    const float sinW0 = sinf(w0);
    const float alpha = sinW0 / (2.0f * Q);

    // RBJ bandpass, constant 0 dB peak gain.
    const float a0 = 1.0f + alpha;
    mB0 = alpha / a0;
    mB1 = 0.0f;
    mB2 = -alpha / a0;
    mA1 = (-2.0f * cosW0) / a0;
    mA2 = (1.0f - alpha) / a0;
}

void SolfeggioResonator::processChannel(
    float* channel,
    int32_t numFrames,
    float& x1, float& x2,
    float& y1, float& y2
) {
    const float wet = mCachedIntensity;
    const float dry = 1.0f - wet;

    for (int32_t i = 0; i < numFrames; ++i) {
        const float x0 = channel[i];

        const float y0 = mB0 * x0 + mB1 * x1 + mB2 * x2
                        - mA1 * y1 - mA2 * y2;

        x2 = x1; x1 = x0;
        y2 = y1; y1 = y0;

        channel[i] = dry * x0 + wet * y0;
    }
}

void SolfeggioResonator::process(float* left, float* right, int32_t numFrames) {
    updateCoefficientsIfNeeded();

    // Bypass total saat intensity 0 — hemat CPU, tidak ada efek sama sekali.
    if (mCachedIntensity <= 0.0f) return;

    processChannel(left, numFrames, mLx1, mLx2, mLy1, mLy2);

    if (right != nullptr && right != left) {
        processChannel(right, numFrames, mRx1, mRx2, mRy1, mRy2);
    }
}

void SolfeggioResonator::reset() {
    mLx1 = mLx2 = mLy1 = mLy2 = 0.0f;
    mRx1 = mRx2 = mRy1 = mRy2 = 0.0f;
}

} // namespace dsp
} // namespace pristine
 