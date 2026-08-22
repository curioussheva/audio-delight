#include "SpectrumAnalyzer.h"
#include <algorithm>
#include <cmath>

namespace pristine {

SpectrumAnalyzer::SpectrumAnalyzer(int fftSize, int sampleRate)
    : mFFTSize(fftSize), mSampleRate(sampleRate), mFFT(fftSize), mRingBuffer(fftSize, 0.0f), mWritePos(0) {
}

void SpectrumAnalyzer::feed(const float* samples, int numSamples) {
    // accumulate samples into ring buffer, then process when full
    for (int i = 0; i < numSamples; ++i) {
        mRingBuffer[mWritePos++] = samples[i];
        if (mWritePos >= mFFTSize) {
            mWritePos = mFFTSize; // wait until explicitly processed
        }
    }
}

std::vector<float> SpectrumAnalyzer::getMagnitudeSpectrum() {
    std::vector<float> out(mFFTSize/2+1, 0.0f);
    if (mWritePos >= mFFTSize) {
        mFFT.process(mRingBuffer.data(), out.data());
        // convert to dB
        for (auto& v : out) {
            v = 20.0f * std::log10(v + 1e-6f);
        }
        mWritePos = 0;
        std::fill(mRingBuffer.begin(), mRingBuffer.end(), 0.0f);
    }
    return out;
}

void SpectrumAnalyzer::reset() {
    std::fill(mRingBuffer.begin(), mRingBuffer.end(), 0.0f);
    mWritePos = 0;
}

} // namespace pristine