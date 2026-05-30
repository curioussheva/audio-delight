#include "ImmersivePipeline.h"

namespace pristine {

// =====================================================
// PREPARE
// =====================================================

void ImmersivePipeline::prepare(
    int32_t sampleRate,
    int32_t maxFrames
) {

    (void)maxFrames;

    mSampleRate = sampleRate;

    mSolfeggio.prepare(sampleRate);

    mBrainwave.prepare(sampleRate);

    mHarmonic.prepare(sampleRate);

    mSpatial.prepare(sampleRate);

    mBinaural.prepare(sampleRate);

    mPrepared = true;
}

// =====================================================
// UPDATE PARAMETERS
// =====================================================

void ImmersivePipeline::updateParameters(
    const DSPParameters& params
) {

    mParams = params;

    mSolfeggio.setFrequency(
        params.solfeggioFreq
    );

    mSolfeggio.setIntensity(
        params.resonanceIntensity
    );

    mBrainwave.setBeatFrequency(
        params.brainwaveFreq
    );
}

// =====================================================
// PROCESS
// =====================================================

void ImmersivePipeline::process(
    float* left,
    float* right,
    int32_t numFrames,
    const DSPParameters& params
) {

    (void)params;

    if (!mPrepared) {
        return;
    }

    // =========================================
    // SOLFEGGIO RESONANCE
    // =========================================

    mSolfeggio.process(
        left,
        right,
        numFrames
    );

    // =========================================
    // HARMONIC EXCITER
    // =========================================

    mHarmonic.process(
        left,
        right,
        numFrames
    );

    // =========================================
    // SPATIAL FIELD
    // =========================================

    mSpatial.process(
        left,
        right,
        numFrames
    );

    // =========================================
    // BRAINWAVE GENERATOR
    // =========================================

    mBrainwave.process(
        left,
        right,
        numFrames
    );

    // =========================================
    // OPTIONAL BINAURAL RENDER
    // =========================================

    // headphone only
    // mBinaural.process(left, right, numFrames);
}

// =====================================================
// RESET
// =====================================================

void ImmersivePipeline::reset() {

    mSolfeggio.reset();

    mBrainwave.reset();

    mHarmonic.reset();

    mSpatial.reset();

    mBinaural.reset();
}

} // namespace pristine