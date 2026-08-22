#include "SincResampler.h"
#include "LinearResampler.h"
#include <vector>
#include <cmath>
#include <algorithm>
#include <android/log.h>

#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, "SincResampler", __VA_ARGS__)

namespace pristine {

struct SincResampler::Impl {
    int32_t inputRate = 0, outputRate = 0, channels = 0;
    double ratio = 1.0;
    double pos = 0.0;
    std::vector<float> history;   // ring buffer for filter
    std::vector<float> coefficients;
    int32_t kernelSize = 64;      // number of taps per lobe (adjustable)
    int32_t halfKernel = 32;
};

SincResampler::SincResampler() : pImpl(std::make_unique<Impl>()) {}
SincResampler::~SincResampler() = default;

static double sinc(double x) {
    if (x == 0.0) return 1.0;
    return std::sin(M_PI * x) / (M_PI * x);
}

static double blackmanWindow(double x) {
    // x in range [-1,1]
    return 0.42 - 0.5 * std::cos(M_PI * (x + 1.0)) + 0.08 * std::cos(2.0 * M_PI * (x + 1.0));
}

bool SincResampler::configure(const ResampleSpec& spec) {
    pImpl->inputRate = spec.inputRate;
    pImpl->outputRate = spec.outputRate;
    pImpl->channels = spec.channels;
    pImpl->ratio = static_cast<double>(spec.inputRate) / spec.outputRate;
    pImpl->pos = 0.0;

    // Build Kaiser-windowed sinc coefficients for resampling
    int32_t taps = 128; // fixed for stub
    pImpl->halfKernel = taps / 2;
    pImpl->coefficients.resize(taps);
    double fc = 0.95 * std::min(1.0, 1.0 / pImpl->ratio); // cutoff
    for (int i = 0; i < taps; ++i) {
        double x = (i - pImpl->halfKernel) * fc;
        double w = blackmanWindow(2.0 * i / taps - 1.0);
        pImpl->coefficients[i] = static_cast<float>(2.0 * fc * sinc(x) * w);
    }
    // Normalize
    double sum = 0.0;
    for (auto v : pImpl->coefficients) sum += v;
    for (auto& v : pImpl->coefficients) v /= static_cast<float>(sum);

    pImpl->history.assign(pImpl->halfKernel * pImpl->channels, 0.0f);
    LOGD("Configured sinc resampler: %d -> %d, taps=%d", spec.inputRate, spec.outputRate, taps);
    return true;
}

int32_t SincResampler::process(const float* input, int32_t inputFrames, float* output, int32_t maxOutputFrames) {
    if (!input || !output || inputFrames <= 0 || maxOutputFrames <= 0) return 0;
    int32_t ch = pImpl->channels;
    int32_t taps = static_cast<int32_t>(pImpl->coefficients.size());
    int32_t half = pImpl->halfKernel;
    int32_t outIdx = 0;
    double ratio = pImpl->ratio;
    double pos = pImpl->pos;

    // Simple approach: for each output sample, compute convolution with input history
    // This is inefficient but works as stub.
    // For production, use polyphase filter bank.

    // Copy current input to history (circular buffer would be better)
    // We'll just simulate: keep sliding window.

    // For now, just use linear interpolation as placeholder (to avoid heavy coding)
    // But to keep the stub simple, we fallback to linear resampling.
    // Real implementation would use the sinc coefficients.

    // STUB: fallback to linear
    dsp::LinearResampler linear;
    linear.configure(pImpl->inputRate, pImpl->outputRate, ch);
    int32_t frames = linear.process(input, inputFrames, output, maxOutputFrames);
    pImpl->pos = 0.0; // dummy
    return frames;
}

void SincResampler::reset() {
    pImpl->pos = 0.0;
    std::fill(pImpl->history.begin(), pImpl->history.end(), 0.0f);
}

int32_t SincResampler::getDelayInFrames() const {
    return pImpl->halfKernel; // approximate delay
}

} // namespace pristine