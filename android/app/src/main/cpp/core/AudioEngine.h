// =====================================================
// core/AudioEngine.h
// Production Modular Audio Engine
// =====================================================

#pragma once

#include <memory>

#include "AudioBufferController.h"
#include "AudioCallback.h"
#include "AudioMetrics.h"
#include "AudioModeManager.h"
#include "AudioPipeline.h"
#include "AudioState.h"
#include "AudioStreamController.h"
#include "AudioTypes.h"

namespace pristine {

class AudioEngine {
public:

    AudioEngine();
    ~AudioEngine();

    // =============================================
    // ENGINE
    // =============================================

    bool start(
        bool exclusiveMode = false
    );

    void stop();

    bool isRunning() const;

    // =============================================
    // INPUT
    // =============================================

    void pushData(
        const float* data,
        int32_t numSamples
    );

    // =============================================
    // MODE
    // =============================================

    void setProcessingMode(
        ProcessingMode mode
    );

    ProcessingMode
    getProcessingMode() const;

    // =============================================
    // DSP CONTROL
    // =============================================

    void setDSPEnabled(
        bool enabled
    );

    void setLimiterEnabled(
        bool enabled
    );

    void setMasterGain(
        float gain
    );

    void setBalance(
        float balance
    );

    void setStereoWidth(
        float width
    );

    void setBassBoost(
        float gainDb
    );

    void setEqBand(
        int band,
        float gainDb
    );

    // =============================================
    // IMMERSIVE
    // =============================================

    void setSolfeggioFreq(
        float freq
    );

    void setBrainwaveFreq(
        float freq
    );

    void setResonanceIntensity(
        float intensity
    );

    // =============================================
    // METRICS
    // =============================================

    EngineStats getStats() const;

    // =============================================
    // RESET
    // =============================================

    void reset();

private:

    AudioState mState;

    AudioMetrics mMetrics;

    AudioBufferController
        mBufferController;

    AudioPipeline mPipeline;

    AudioCallback mCallback;

    AudioStreamController
        mStreamController;
};

} // namespace pristine 