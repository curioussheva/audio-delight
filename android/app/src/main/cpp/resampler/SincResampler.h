#pragma once
#include "AudioResampler.h"
#include <memory>

namespace pristine {

class SincResampler : public AudioResampler {
public:
    SincResampler();
    ~SincResampler() override;
    bool configure(const ResampleSpec& spec) override;
    int32_t process(const float* input, int32_t inputFrames, float* output, int32_t maxOutputFrames) override;
    void reset() override;
    int32_t getDelayInFrames() const override;

private:
    struct Impl;
    std::unique_ptr<Impl> pImpl;
};

} // namespace pristine