#include "WaveformVisualizer.h"
#include <memory>
#include <vector>

namespace audio {

struct WaveformVisualizer::Impl {
    std::vector<float> buffer;
    int windowSize;
    Impl(int size) : windowSize(size), buffer(size*2, 0.0f) {}
};

WaveformVisualizer::WaveformVisualizer(int windowSize)
    : pImpl(std::make_unique<Impl>(windowSize)) {}

WaveformVisualizer::~WaveformVisualizer() = default;

void WaveformVisualizer::feed(const float* left, const float* right, int numSamples) {
    // copy to internal buffer (circular) - stub
}

std::vector<float> WaveformVisualizer::getWaveform() {
    return pImpl->buffer;
}

void WaveformVisualizer::onUpdate(std::function<void(const std::vector<float>&)> callback) {
    // stub
}

} // namespace audio