#include "EngineManager.h"

// ==========================================
// SINGLETON
// ==========================================

EngineManager& EngineManager::get() {
    static EngineManager instance;
    return instance;
}

// ==========================================
// ACCESS
// ==========================================

AudioEngine& EngineManager::engine() {
    return mEngine;
}

// ==========================================
// LIFECYCLE
// ==========================================

void EngineManager::start() {
    std::lock_guard<std::mutex> lock(mMutex);
    mEngine.start();
}

void EngineManager::stop() {
    std::lock_guard<std::mutex> lock(mMutex);
    mEngine.stop();
}

// ==========================================
// DSP CONTROL
// ==========================================

void EngineManager::setEqBand(int band, float gainDb) {
    mEngine.setEqBand(band, gainDb);
}

void EngineManager::setBassBoost(float gainDb) {
    mEngine.setBassBoost(gainDb);
}

void EngineManager::setMasterGain(float gain) {
    mEngine.setMasterGain(gain);
}

void EngineManager::setBalance(float balance) {
    mEngine.setBalance(balance);
}

void EngineManager::setStereoWide(float width) {
    mEngine.setStereoWide(width);
}

// ==========================================
// MODE CONTROL (🔥 CORE)
// ==========================================

void EngineManager::setProcessingMode(int mode) {
    std::lock_guard<std::mutex> lock(mMutex);

    // optional: restart kalau perlu
    bool wasRunning = mEngine.isRunning();

    if (wasRunning) {
        mEngine.stop();
    }

    mEngine.setProcessingMode(mode);

    if (wasRunning) {
        mEngine.start();
    }
}

void EngineManager::setExclusiveMode(bool enabled) {
    std::lock_guard<std::mutex> lock(mMutex);

    bool wasRunning = mEngine.isRunning();

    if (wasRunning) {
        mEngine.stop();
    }

    mEngine.setExclusiveMode(enabled);

    if (wasRunning) {
        mEngine.start();
    }
}