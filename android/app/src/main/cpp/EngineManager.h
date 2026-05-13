#pragma once
#include "AudioEngine.h"
#include <mutex>

class EngineManager {
public:
    static EngineManager& get();

    // lifecycle
    void start();
    void stop();

    // DSP control
    void setEqBand(int band, float gainDb);
    void setBassBoost(float gainDb);
    void setMasterGain(float gain);
    void setBalance(float balance);
    void setStereoWide(float width);

    // mode
    void setProcessingMode(int mode); // 0 = bit-perfect, 1 = DSP
    void setExclusiveMode(bool enabled);

    // access
    AudioEngine& engine();

private:
    EngineManager() = default;

    AudioEngine mEngine;
    std::mutex mMutex;
}; 