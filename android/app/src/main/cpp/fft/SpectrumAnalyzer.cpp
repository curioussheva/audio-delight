#include "SpectrumAnalyzer.h"
#include <algorithm>
#include <cmath>

namespace pristine {

SpectrumAnalyzer::SpectrumAnalyzer(int fftSize, int sampleRate)
    : mFFTSize(fftSize), mSampleRate(sampleRate), mFFT(fftSize), mRingBuffer(fftSize, 0.0f), mWritePos(0) {
}

void SpectrumAnalyzer::feed(const float* samples, int numSamples) {
    // accumulate samples into ring buffer, then process when full
    if (!samples || numSamples <= 0) return;
    // FIX (F-M1, 2026-11-11): kalau buffer sudah penuh, BUANG sampel baru
    // sampai getMagnitudeSpectrum() memprosesnya. Sebelumnya loop di bawah
    // menulis mRingBuffer[mWritePos++] SEBELUM cek batas, dan cap menahan
    // mWritePos di mFFTSize — jadi setiap sampel sesudah penuh menulis
    // mRingBuffer[mFFTSize] (heap-buffer-overflow WRITE, TERBUKTI ASan).
    if (mWritePos >= mFFTSize) return;
    const int room = mFFTSize - mWritePos;
    const int n = std::min(numSamples, room);
    for (int i = 0; i < n; ++i) {
        mRingBuffer[mWritePos++] = samples[i];
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