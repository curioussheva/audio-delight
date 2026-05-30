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
        mState.isRunning.load(
            std::memory_order_acquire
        )
    ) {
        return true;
    }

    if (
        !mStreamController.openStream(
            &mCallback,
            exclusiveMode
        )
    ) {
        return false;
    }

    if (
        !mStreamController.startStream()
    ) {

        mStreamController.closeStream();

        return false;
    }

    mState.exclusiveMode.store(
        exclusiveMode,
        std::memory_order_release
    );

    mState.isRunning.store(
        true,
        std::memory_order_release
    );

    return true;
}

// =====================================================
// STOP
// =====================================================

void AudioEngine::stop() {

    mState.isRunning.store(
        false,
        std::memory_order_release
    );

    mStreamController.stopStream();

    mStreamController.closeStream();

    reset();
}

// =====================================================
// IS RUNNING
// =====================================================

bool AudioEngine::isRunning() const {

    return
        mState.isRunning.load(
            std::memory_order_acquire
        );
}

// =====================================================
// PUSH DATA
// =====================================================

void AudioEngine::pushData(
    const float* data,
    int32_t numSamples
) {

    mBufferController.pushData(
        data,
        numSamples
    );
}

// =====================================================
// PROCESSING MODE
// =====================================================

void AudioEngine::setProcessingMode(
    ProcessingMode mode
) {

    mState.processingMode.store(
        mode,
        std::memory_order_release
    );

    rebuildPipeline();
}

// =====================================================
// GET MODE
// =====================================================

ProcessingMode
AudioEngine::getProcessingMode() const {

    return
        mState.processingMode.load(
            std::memory_order_acquire
        );
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

    mState.isDSPEnabled.store(
        enabled,
        std::memory_order_release
    );
}

// =====================================================
// LIMITER ENABLE
// =====================================================

void AudioEngine::setLimiterEnabled(
    bool enabled
) {

    mState.isLimiterEnabled.store(
        enabled,
        std::memory_order_release
    );
}

// =====================================================
// MASTER GAIN
// =====================================================

void AudioEngine::setMasterGain(
    float gain
) {

    mState.masterGain.store(
        gain,
        std::memory_order_release
    );
}

// =====================================================
// BALANCE
// =====================================================

void AudioEngine::setBalance(
    float balance
) {

    mState.balance.store(
        balance,
        std::memory_order_release
    );
}

// =====================================================
// STEREO WIDTH
// =====================================================

void AudioEngine::setStereoWidth(
    float width
) {

    mState.stereoWidth.store(
        width,
        std::memory_order_release
    );
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

    mState.solfeggioFreq.store(
        freq,
        std::memory_order_release
    );
}

// =====================================================
// BRAINWAVE
// =====================================================

void AudioEngine::setBrainwaveFreq(
    float freq
) {

    mState.brainwaveFreq.store(
        freq,
        std::memory_order_release
    );
}

// =====================================================
// RESONANCE
// =====================================================

void AudioEngine::setResonanceIntensity(
    float intensity
) {

    mState.resonanceIntensity.store(
        intensity,
        std::memory_order_release
    );
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

    mBufferController.reset();

    mMetrics.reset();
}

} // namespace pristine 