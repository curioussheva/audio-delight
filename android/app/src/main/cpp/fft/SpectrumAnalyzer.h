#pragma once
#include "FFTProcessor.h"
#include <vector>

namespace pristine {

class SpectrumAnalyzer {
public:
    explicit SpectrumAnalyzer(int fftSize = 2048, int sampleRate = 48000);
    void feed(const float* samples, int numSamples);
    std::vector<float> getMagnitudeSpectrum();  // dB scale, size fftSize/2+1
    void reset();

private:
    int mFFTSize;
    int mSampleRate;
    FFTProcessor mFFT;
    std::vector<float> mRingBuffer;
    int mWritePos;
};

} // namespace pristine