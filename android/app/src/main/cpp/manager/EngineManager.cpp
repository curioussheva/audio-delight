// =====================================================
// manager/EngineManager.cpp
// =====================================================

#include "EngineManager.h"

namespace pristine {

// =====================================================
// CONSTRUCTOR
// =====================================================

EngineManager::EngineManager()
    :

    mEngine(),

    mPlayback() {

}

// =====================================================
// SINGLETON
// =====================================================

EngineManager&
EngineManager::get() {

    static EngineManager instance;

    return instance;
}

// =====================================================
// ACCESS
// =====================================================

AudioEngine&
EngineManager::engine() {

    return mEngine;
}

playback::PlaybackController&
EngineManager::playback() {

    return mPlayback;
}

AudioState&
EngineManager::state() {

    return mState;
}

// =====================================================
// LIFECYCLE
// =====================================================

void EngineManager::start() {

    std::lock_guard<std::mutex>
        lock(mMutex);

    if (
        mEngine.isRunning()
    ) {
        return;
    }

    const bool exclusiveMode =
        mState.exclusiveMode();

    mEngine.start(
        exclusiveMode
    );
}

void EngineManager::stop() {

    std::lock_guard<std::mutex>
        lock(mMutex);

    if (
        !mEngine.isRunning()
    ) {
        return;
    }

    mEngine.stop();
}

// =====================================================
// PLAYBACK
// =====================================================

void EngineManager::play() {

    mPlayback.play();
}

void EngineManager::pause() {

    mPlayback.pause();
}

// =====================================================
// DSP CONTROL
// =====================================================

void EngineManager::setDSPEnabled(
    bool enabled
) {

    mEngine.setDSPEnabled(
        enabled
    );
}

void EngineManager::setLimiterEnabled(
    bool enabled
) {

    mEngine.setLimiterEnabled(
        enabled
    );
}

void EngineManager::setEqBand(
    int band,
    float gainDb
) {

    mEngine.setEqBand(
        band,
        gainDb
    );
}

void EngineManager::setBassBoost(
    float gainDb
) {

    mEngine.setBassBoost(
        gainDb
    );
}

void EngineManager::setSolfeggioFreq(float freq) {
    mEngine.setSolfeggioFreq(freq);
}

void EngineManager::setBrainwaveFreq(float freq) {
    mEngine.setBrainwaveFreq(freq);
}

void EngineManager::setResonanceIntensity(float intensity) {
    mEngine.setResonanceIntensity(intensity);
}

void EngineManager::setImmersiveEnabled(bool enabled) {
    mEngine.setImmersiveEnabled(enabled);
}

void EngineManager::setMasterGain(
    float gain
) {

    mEngine.setMasterGain(
        gain
    );
}

void EngineManager::setBalance(
    float balance
) {

    mEngine.setBalance(
        balance
    );
}

void EngineManager::setStereoWide(
    float width
) {

    mEngine.setStereoWidth(
        width
    );
}

// =====================================================
// PROCESSING MODE
// =====================================================

void EngineManager::setProcessingMode(
    ProcessingMode mode
) {

    mState.setProcessingMode(mode);

    mEngine.setProcessingMode(
        mode
    );
}

// =====================================================
// EXCLUSIVE MODE
// =====================================================

void EngineManager::setExclusiveMode(
    bool enabled
) {

    std::lock_guard<std::mutex>
        lock(mMutex);

    const bool wasRunning =
        mEngine.isRunning();

    if (wasRunning) {

        mEngine.stop();
    }

    mState.setExclusiveMode(enabled);

    if (wasRunning) {

        mEngine.start(
            enabled
        );
    }
}

// =====================================================
// METRICS
// =====================================================

EngineStats
EngineManager::getStats() const {

    return mEngine.getStats();
}

} // namespace pristine 