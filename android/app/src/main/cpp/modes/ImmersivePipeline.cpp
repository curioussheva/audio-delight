#include "ImmersivePipeline.h"

namespace pristine {

namespace {

// =====================================================
// FREQUENCY -> BRAINWAVE BAND MAPPING
// Standard psychoacoustic band boundaries.
// =====================================================

audio::dsp::BrainwaveType mapFrequencyToBrainwaveType(float hz) {
    if (hz < 4.0f)  return audio::dsp::BrainwaveType::DELTA;
    if (hz < 8.0f)  return audio::dsp::BrainwaveType::THETA;
    if (hz < 13.0f) return audio::dsp::BrainwaveType::ALPHA;
    if (hz < 30.0f) return audio::dsp::BrainwaveType::BETA;
    return audio::dsp::BrainwaveType::GAMMA;
}

} // namespace

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

    mBrainwave.setType(
        mapFrequencyToBrainwaveType(params.brainwaveFreq)
    );

    mBrainwave.setVolume(
        params.resonanceIntensity
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

    mBrainwave.generate(
        left,
        right,
        numFrames,
        static_cast<float>(mSampleRate)
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
