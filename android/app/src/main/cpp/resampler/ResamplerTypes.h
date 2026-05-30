#pragma once
#include <cstdint>

namespace pristine {

enum class ResamplerType {
    LINEAR,
    SINC_FAST,
    SINC_MEDIUM,
    SINC_BEST
};

struct ResampleSpec {
    int32_t inputRate;
    int32_t outputRate;
    int32_t channels;
    ResamplerType type = ResamplerType::SINC_MEDIUM;
};

} // namespace pristine