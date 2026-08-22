#include "AudioResampler.h"
#include "LinearResampler.h"
#include "SincResampler.h"
#include <memory>

namespace pristine {

namespace {

// =====================================================
// LINEAR RESAMPLER ADAPTER
// Wraps dsp::LinearResampler (standalone, non-polymorphic)
// to satisfy the AudioResampler interface for the factory.
// =====================================================

class LinearResamplerAdapter : public AudioResampler {
public:
    bool configure(const ResampleSpec& spec) override {
        impl_.configure(
            spec.inputRate,
            spec.outputRate,
            spec.channels
        );
        return true;
    }

    int32_t process(
        const float* input,
        int32_t inputFrames,
        float* output,
        int32_t maxOutputFrames
    ) override {
        return impl_.process(
            input,
            inputFrames,
            output,
            maxOutputFrames
        );
    }

    void reset() override {
        impl_.reset();
    }

    int32_t getDelayInFrames() const override {
        // Linear interpolation has no lookahead buffer.
        return 0;
    }

private:
    dsp::LinearResampler impl_;
};

} // namespace

std::unique_ptr<AudioResampler> createResampler(ResamplerType type) {
    switch (type) {
        case ResamplerType::LINEAR:
            return std::make_unique<LinearResamplerAdapter>();
        case ResamplerType::SINC_FAST:
        case ResamplerType::SINC_MEDIUM:
        case ResamplerType::SINC_BEST:
            return std::make_unique<SincResampler>();
        default:
            return std::make_unique<LinearResamplerAdapter>();
    }
}

} // namespace pristine
