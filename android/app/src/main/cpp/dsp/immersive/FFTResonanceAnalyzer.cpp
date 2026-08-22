#include "FFTResonanceAnalyzer.h"
#include <algorithm>

namespace pristine { namespace dsp {

FFTResonanceAnalyzer::FFTResonanceAnalyzer(int fftSize)
    : mFFTSize(fftSize), mPlan(fftSize), mBuffer(fftSize, 0.0f), mWritePos(0) {}

void FFTResonanceAnalyzer::process(const float* left, const float* right, int32_t numFrames) {
    // accumulate mono sum
    for (int32_t i = 0; i < numFrames; ++i) {
        if (mWritePos < mFFTSize) {
            mBuffer[mWritePos++] = (left[i] + right[i]) * 0.5f;
        }
    }
}

float FFTResonanceAnalyzer::getDominantFrequency() const {
    return 0.0f; // stub
}

void FFTResonanceAnalyzer::reset() {
    std::fill(mBuffer.begin(), mBuffer.end(), 0.0f);
    mWritePos = 0;
}

}} // namespace