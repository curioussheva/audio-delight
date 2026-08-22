#pragma once
#include <vector>
#include <functional>

namespace pristine {

class WaveformVisualizer {
public:
    WaveformVisualizer(int windowSize = 4096);
    ~WaveformVisualizer();
    void feed(const float* left, const float* right, int numSamples);
    std::vector<float> getWaveform(); // returns interleaved [L,R] samples
    void onUpdate(std::function<void(const std::vector<float>&)> callback);

private:
    class Impl;
    std::unique_ptr<Impl> pImpl;
};

} // namespace pristine