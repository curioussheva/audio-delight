#include "DSPPipeline.h"

namespace pristine {

// =====================================================
// PREPARE
// =====================================================

void DSPPipeline::prepare(
    int32_t sampleRate,
    int32_t maxFrames
) {

    mSampleRate = sampleRate;

    mDSPChain.prepare(
        sampleRate,
        maxFrames
    );

    mPrepared = true;
}

// =====================================================
// UPDATE PARAMETERS
// =====================================================

void DSPPipeline::updateParameters(
    const DSPParameters& params
) {

    mCurrentParams = params;

    DSPConfig config;

    config.enabled = params.dspEnabled;
    config.limiterEnabled = params.limiterEnabled;
    config.mode = params.processingMode;

    config.masterGain = params.masterGain;
    config.balance = params.balance;
    config.stereoWidth = params.stereoWidth;

    for (int i = 0; i < 10; ++i) {
        config.eqGain[i] = params.eqGains[i];
    }

    config.bassBoost = params.bassBoostGain;

    config.solfeggioFreq = params.solfeggioFreq;
    config.brainwaveFreq = params.brainwaveFreq;
    config.resonanceIntensity = params.resonanceIntensity;

    mDSPChain.applyConfig(config);
}

// =====================================================
// PROCESS
// =====================================================

void DSPPipeline::process(
    float* left,
    float* right,
    int32_t numFrames,
    const DSPParameters& params
) {

    (void)params;

    if (!mPrepared) {
        return;
    }

    mDSPChain.process(
        left,
        right,
        numFrames
    );
}

// =====================================================
// RESET
// =====================================================

void DSPPipeline::reset() {

    mDSPChain.reset();
}

} // namespace pristine