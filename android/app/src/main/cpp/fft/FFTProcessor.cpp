#include "FFTProcessor.h"
#include <cmath>

namespace audio {

FFTProcessor::FFTProcessor(int fftSize) 
    : mFFTSize(fftSize), mPlan(fftSize), mBuffer(fftSize), mMagnitude(fftSize/2+1) {
    mWindow = createHanningWindow(fftSize);
}

void FFTProcessor::setWindowType(const std::vector<float>& window) {
    if (window.size() == static_cast<size_t>(mFFTSize)) {
        mWindow = window;
    }
}

void FFTProcessor::process(const float* input, float* outputMagnitude) {
    if (!input || !outputMagnitude) return;
    // apply window and copy to buffer
    for (int i = 0; i < mFFTSize; ++i) {
        mBuffer[i] = Complex(input[i] * mWindow[i], 0.0f);
    }
    // forward FFT (stub)
    mPlan.forward(reinterpret_cast<const float*>(mBuffer.data()), mBuffer.data());
    // compute magnitude
    for (int i = 0; i <= mFFTSize/2; ++i) {
        outputMagnitude[i] = std::sqrt(mBuffer[i].real() * mBuffer[i].real() + mBuffer[i].imag() * mBuffer[i].imag());
    }
}

} // namespace audio