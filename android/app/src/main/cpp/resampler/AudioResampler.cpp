#include "AudioResampler.h"
#include "LinearResampler.h"
#include "SincResampler.h"
#include <memory>

namespace pristine {

std::unique_ptr<AudioResampler> createResampler(ResamplerType type) {
    switch (type) {
        case ResamplerType::LINEAR:
            return std::make_unique<LinearResampler>();
        case ResamplerType::SINC_FAST:
        case ResamplerType::SINC_MEDIUM:
        case ResamplerType::SINC_BEST:
            return std::make_unique<SincResampler>();
        default:
            return std::make_unique<LinearResampler>();
    }
}

} // namespace pristine