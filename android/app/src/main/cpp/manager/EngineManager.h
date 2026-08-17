#pragma once

#include <mutex>

#include "../core/AudioEngine.h"
#include "../core/AudioState.h"
#include "../playback/PlaybackController.h"

namespace pristine {

class EngineManager {
public:

    static EngineManager& get();

    AudioEngine& engine();

    PlaybackController&
    playback();

    AudioState&
    state();

    // lifecycle
    void start();
    void stop();

    // playback
    void play();
    void pause();

    // dsp
    void setDSPEnabled(bool enabled);
    void setLimiterEnabled(bool enabled);
    void setEqBand(int band, float gainDb);
    void setBassBoost(float gainDb);
    void setMasterGain(float gain);
    void setBalance(float balance);
    void setStereoWide(float width);

    // immersive
    void setSolfeggioFreq(float freq);
    void setBrainwaveFreq(float freq);
    void setResonanceIntensity(float intensity);
    void setImmersiveEnabled(bool enabled);

    // mode
    void setProcessingMode(
        ProcessingMode mode
    );

    void setExclusiveMode(
        bool enabled
    );

    // metrics
    EngineStats getStats() const;

private:

    EngineManager();

    ~EngineManager() = default;

    EngineManager(
        const EngineManager&
    ) = delete;

    EngineManager&
    operator=(
        const EngineManager&
    ) = delete;

private:

    mutable std::mutex mMutex;

    AudioState mState;

    AudioEngine mEngine;

    PlaybackController mPlayback;
};

} // namespace pristine 


