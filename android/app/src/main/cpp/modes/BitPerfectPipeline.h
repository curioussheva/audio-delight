#pragma once

#include "../core/AudioTypes.h"

namespace pristine {

class BitPerfectPipeline final {
public:

    BitPerfectPipeline() = default;
    ~BitPerfectPipeline() = default;

    // =================================================
    // BIT PERFECT PATH
    // No DSP
    // No gain
    // No limiter
    // No stereo processing
    // No sample modification
    // =================================================

    void process(
        float* left,
        float* right,
        int32_t numFrames,
        const DSPParameters& params
    );

    void reset();
};

} // namespace pristine
