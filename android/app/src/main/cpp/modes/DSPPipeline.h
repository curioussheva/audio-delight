#pragma once

#include "../core/AudioTypes.h"

#include "../dsp/DSPChain.h"

namespace pristine {

class DSPPipeline final {
public:

    DSPPipeline() = default;
    ~DSPPipeline() = default;

    // =================================================
    // PREPARE
    // =================================================

    void prepare(
        int32_t sampleRate,
        int32_t maxFrames
    );

    // =================================================
    // PARAMETER UPDATE
    // Called from NON realtime thread
    // =================================================

    void updateParameters(
        const DSPParameters& params
    );

    // =================================================
    // PROCESS
    // Realtime-safe
    // =================================================

    void process(
        float* left,
        float* right,
        int32_t numFrames,
        const DSPParameters& params
    );

    void reset();

private:

    DSPChain mDSPChain;

    DSPParameters mCurrentParams{};

    int32_t mSampleRate = 48000;

    bool mPrepared = false;
};

} // namespace pristine