#include "SpectrumVisualizer.h"
#include "../fft/SpectrumAnalyzer.h"
#include <memory>
#include <thread>
#include <atomic>

namespace audio {

struct SpectrumVisualizer::Impl {
    SpectrumAnalyzer analyzer;
    std::vector<float> latestSpectrum;
    std::function<void(const std::vector<float>&)> callback;
    std::atomic<bool> running{false};
    std::thread updateThread;
    int updateIntervalMs = 50;

    Impl(int fftSize, int sampleRate) : analyzer(fftSize, sampleRate) {}
};

SpectrumVisualizer::SpectrumVisualizer(int fftSize, int sampleRate)
    : pImpl(std::make_unique<Impl>(fftSize, sampleRate)) {}

SpectrumVisualizer::~SpectrumVisualizer() = default;

void SpectrumVisualizer::feed(const float* left, const float* right, int numSamples) {
    // feed mono sum
    std::vector<float> mono(numSamples);
    for (int i = 0; i < numSamples; ++i) {
        mono[i] = (left[i] + right[i]) * 0.5f;
    }
    pImpl->analyzer.feed(mono.data(), numSamples);
}

std::vector<float> SpectrumVisualizer::getSpectrum() {
    return pImpl->analyzer.getMagnitudeSpectrum();
}

void SpectrumVisualizer::setUpdateRateHz(float hz) {
    pImpl->updateIntervalMs = static_cast<int>(1000.0f / hz);
}

void SpectrumVisualizer::onUpdate(std::function<void(const std::vector<float>&)> callback) {
    pImpl->callback = callback;
    // start thread etc. (stub)
}

} // namespace audio