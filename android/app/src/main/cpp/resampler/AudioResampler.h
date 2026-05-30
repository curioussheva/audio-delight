#pragma once
#include "ResamplerTypes.h"

namespace pristine {

class AudioResampler {
public:
    virtual ~AudioResampler() = default;
    virtual bool configure(const ResampleSpec& spec) = 0;
    virtual int32_t process(const float* input, int32_t inputFrames, float* output, int32_t maxOutputFrames) = 0;
    virtual void reset() = 0;
    virtual int32_t getDelayInFrames() const = 0;
};

} // namespace pristine