// =====================================================
// core/AudioEngine.cpp
// =====================================================

#include "AudioEngine.h"

namespace pristine {

// =====================================================
// CONSTRUCTOR
// =====================================================

AudioEngine::AudioEngine()
    :

    mCallback(
        mBufferController,
        mMetrics,
        mState
    ) {

    rebuildPipeline();
}

// =====================================================
// DESTRUCTOR
// =====================================================

AudioEngine::~AudioEngine() {

    stop();
}

// =====================================================
// START
// =====================================================

bool AudioEngine::start(
    bool exclusiveMode
) {

    if (
    mState.isRunning()
) {
        return true;
    }

    if (
    !mStreamController.open(
        &mCallback,
        exclusiveMode
    )
) {
        return false;
    }

    if (
    !mStreamController.start()
) {

    mStreamController.close();

    return false;
}

    mState.setExclusiveMode(exclusiveMode);
    mState.setRunning(true); 

    return true;
}

// =====================================================
// STOP
// =====================================================

void AudioEngine::stop() {

    mState.setRunning(false);

    mStreamController.stop();

    mStreamController.close();

    reset();
}

// =====================================================
// IS RUNNING
// =====================================================

bool AudioEngine::isRunning() const {

    return mState.isRunning();
}

// =====================================================
// PUSH DATA
// =====================================================

void AudioEngine::pushData(
    const float* data,
    int32_t numSamples
) {

    mBufferController.pushInterleaved(
    data,
    static_cast<uint32_t>(numSamples)
);
}

// =====================================================
// PROCESSING MODE
// =====================================================

void AudioEngine::setProcessingMode(
    ProcessingMode mode
) {

    mState.setProcessingMode(mode);

    rebuildPipeline();
}

// =====================================================
// GET MODE
// =====================================================

ProcessingMode
AudioEngine::getProcessingMode() const {

    return mState.processingMode();
}

// =====================================================
// REBUILD PIPELINE
// =====================================================

void AudioEngine::rebuildPipeline() {

    auto pipeline =
        AudioModeManager
            ::getInstance()
            .createPipeline(
                getProcessingMode()
            );

    mCallback.switchPipeline(
        std::move(pipeline)
    );
}

// =====================================================
// DSP ENABLE
// =====================================================

void AudioEngine::setDSPEnabled(
    bool enabled
) {

    mState.setDSPEnabled(enabled);
}

// =====================================================
// LIMITER ENABLE
// =====================================================

void AudioEngine::setLimiterEnabled(
    bool enabled
) {

    mState.setLimiterEnabled(enabled);
}

// =====================================================
// MASTER GAIN
// =====================================================

void AudioEngine::setMasterGain(
    float gain
) {

    mState.setMasterGain(gain);
}

// =====================================================
// BALANCE
// =====================================================

void AudioEngine::setBalance(
    float balance
) {

    mState.setBalance(balance);
}

// =====================================================
// STEREO WIDTH
// =====================================================

void AudioEngine::setStereoWidth(
    float width
) {

    mState.setStereoWidth(width);
}

// =====================================================
// BASS BOOST
// =====================================================

void AudioEngine::setBassBoost(
    float gainDb
) {

    // reserved for DSP pipeline param sync
}

// =====================================================
// EQ BAND
// =====================================================

void AudioEngine::setEqBand(
    int,
    float
) {

    // reserved for DSP pipeline param sync
}

// =====================================================
// SOLFEGGIO
// =====================================================

void AudioEngine::setSolfeggioFreq(
    float freq
) {

    mState.setSolfeggioFreq(freq);
}

// =====================================================
// BRAINWAVE
// =====================================================

void AudioEngine::setBrainwaveFreq(
    float freq
) {

    mState.setBrainwaveFreq(freq);
}

// =====================================================
// RESONANCE
// =====================================================

void AudioEngine::setResonanceIntensity(
    float intensity
) {

    mState.setResonanceIntensity(intensity);
}

// =====================================================
// STATS
// =====================================================

EngineStats
AudioEngine::getStats() const {

    return mMetrics.getStats();
}

// =====================================================
// RESET
// =====================================================

void AudioEngine::reset() {

    mBufferController.clear();

    mMetrics.reset();
}

} // namespace pristine