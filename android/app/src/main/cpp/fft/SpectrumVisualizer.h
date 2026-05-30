#pragma once
#include <vector>
#include <functional>

namespace audio {

class SpectrumVisualizer {
public:
    explicit SpectrumVisualizer(int fftSize = 2048, int sampleRate = 48000);
    void feed(const float* left, const float* right, int numSamples);
    std::vector<float> getSpectrum(); // dB values, size fftSize/2+1
    void setUpdateRateHz(float hz);
    void onUpdate(std::function<void(const std::vector<float>&)> callback);

private:
    class Impl;
    std::unique_ptr<Impl> pImpl;
};

} // namespace audio