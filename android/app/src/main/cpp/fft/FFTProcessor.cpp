#include "FFTProcessor.h"
#include "WindowFunctions.h"
#include <cmath>

namespace pristine {

FFTProcessor::FFTProcessor(int fftSize)
    : mFFTSize(fftSize), mPlan(fftSize), mBuffer(fftSize), mMagnitude(fftSize/2+1), mRealIn(fftSize) {
    mWindow = createHanningWindow(fftSize);
}

void FFTProcessor::setWindowType(const std::vector<float>& window) {
    if (window.size() == static_cast<size_t>(mFFTSize)) {
        mWindow = window;
    }
}

void FFTProcessor::process(const float* input, float* outputMagnitude) {
    if (!input || !outputMagnitude) return;
    // FIX (F-M2, 2026-11-11): jendela ke buffer REAL terpisah, lalu
    // forward() di atasnya. Sebelumnya forward() dipanggil dengan
    // reinterpret_cast<const float*>(mBuffer.data()) — buffer Complex dibaca
    // sebagai float, jadi yang di-FFT adalah [x0,0,x1,0,...] (setengah frame
    // disisipi nol): DC menghasilkan puncak Nyquist palsu 511.8 (harusnya 0).
    for (int i = 0; i < mFFTSize; ++i) {
        mRealIn[i] = input[i] * mWindow[i];
    }
    mPlan.forward(mRealIn.data(), mBuffer.data());
    // compute magnitude
    for (int i = 0; i <= mFFTSize/2; ++i) {
        outputMagnitude[i] = std::sqrt(mBuffer[i].real() * mBuffer[i].real() + mBuffer[i].imag() * mBuffer[i].imag());
    }
}

} // namespace pristine