#pragma once

#include "../core/AudioPipeline.h"

namespace pristine {

class BitPerfectPipeline final : public AudioPipeline {
public:

    BitPerfectPipeline() = default;
    ~BitPerfectPipeline() override = default;

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
    ) override;

    void reset() override;
};

} // namespace pristine