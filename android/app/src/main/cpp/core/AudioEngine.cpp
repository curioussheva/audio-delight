// =====================================================
// core/AudioEngine.cpp
// =====================================================

#include "AudioEngine.h"
#include "../playback/PlaybackController.h"

namespace pristine {

// =====================================================
// CONSTRUCTOR
// =====================================================

AudioEngine::AudioEngine()
    :

    mCallback(
        mBufferController,
        mPipeline,
        mMetrics,
        mState
    ) {
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

    mPipeline.prepare(
        mStreamController.sampleRate(),
        mStreamController.framesPerBurst()
    );

    mCallback.setSampleRate(
        mStreamController.sampleRate()
    );

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
// SET PLAYBACK CONTROLLER
// =====================================================

void AudioEngine::setPlaybackController(
    playback::PlaybackController* controller
) {

    mCallback.setPlaybackController(controller);
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
}

// =====================================================
// GET MODE
// =====================================================

ProcessingMode
AudioEngine::getProcessingMode() const {

    return mState.processingMode();
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
// IMMERSIVE ENABLE
// =====================================================

void AudioEngine::setImmersiveEnabled(
    bool enabled
) {

    mState.setImmersiveEnabled(enabled);
}

// =====================================================
// VISUALIZER
// =====================================================

void AudioEngine::getVisualizerData(
    float* dst,
    int32_t size
) const {

    mCallback.visualizerBuffer().read(
        dst,
        size
    );
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

    mPipeline.reset();

    mMetrics.reset();
}

} // namespace pristine 