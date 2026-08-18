#pragma once

#include <cstdint>

#include "AudioState.h"

#include "../dsp/DSPChain.h"

namespace pristine {

// =====================================================
// AUDIO PIPELINE
// Realtime DSP orchestration layer
// =====================================================

class AudioPipeline {
public:

    AudioPipeline();

    // =============================================
    // LIFECYCLE
    // =============================================

    void prepare(
        int32_t sampleRate,
        int32_t maxFrames
    );

    void reset();

    // =============================================
    // PROCESS
    // =============================================

   void process(float* left, float* right, int32_t frames, const DSPParameters& params) noexcept;

private:

    // =============================================
    // MODES
    // =============================================

    void processBitPerfect(
        float* left,
        float* right,
        int32_t frames
    ) noexcept;

    void processDSP(
        float* left,
        float* right,
        int32_t frames,
        const AudioState& state
    ) noexcept;

    void processImmersive(
        float* left,
        float* right,
        int32_t frames,
        const AudioState& state
    ) noexcept;

private:

    DSPChain mDSP;

    int32_t mSampleRate = 48000;

    int32_t mMaxFrames = 1920;
};

} // namespace pristine