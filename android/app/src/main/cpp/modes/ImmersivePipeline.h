#pragma once

#include "../core/AudioTypes.h"

#include "../dsp/immersive/SolfeggioResonator.h"
#include "../dsp/immersive/BrainwaveGenerator.h"
#include "../dsp/immersive/HarmonicExciter.h"
#include "../dsp/immersive/SpatialFieldProcessor.h"
#include "../dsp/immersive/BinauralRenderer.h"

namespace pristine {

class ImmersivePipeline final {
public:

    ImmersivePipeline() = default;
    ~ImmersivePipeline() = default;

    // =================================================
    // PREPARE
    // =================================================

    void prepare(
        int32_t sampleRate,
        int32_t maxFrames
    );

    // =================================================
    // PARAM UPDATE
    // NON realtime thread
    // =================================================

    void updateParameters(
        const DSPParameters& params
    );

    // =================================================
    // PROCESS
    // =================================================

    void process(
        float* left,
        float* right,
        int32_t numFrames,
        const DSPParameters& params
    );

    void reset();

private:

    dsp::SolfeggioResonator mSolfeggio;

    audio::dsp::BrainwaveGenerator mBrainwave;

    audio::dsp::HarmonicExciter mHarmonic;

    audio::dsp::SpatialFieldProcessor mSpatial;

    audio::dsp::BinauralRenderer mBinaural;

    DSPParameters mParams{};

    int32_t mSampleRate = 48000;

    bool mPrepared = false;
};

} // namespace pristine