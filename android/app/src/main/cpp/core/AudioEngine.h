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

namespace pristine::playback {
class PlaybackController;
}

namespace pristine {

class AudioEngine {
public:
    AudioEngine();
    ~AudioEngine();

    // =============================================
    // ENGINE
    // =============================================

    // `requestedSampleRate` = laju stream yang diinginkan (dari kapabilitas
    // DAC atau laju file). 0 = default 48000.
    //
    // Diisi supaya sampel dikirim ke DAC pada laju aslinya. Kalau device/DAC
    // tidak mendukung laju itu, stream tetap dibuka di laju terdekat dan
    // laju sebenarnya bisa dibaca lewat actualSampleRate().
    bool start(
        bool exclusiveMode = false,
        int32_t requestedSampleRate = 0
    );

    // Laju yang BENAR-BENAR dipakai stream. Dipakai decoder sebagai target
    // resample supaya tidak ada konversi yang tidak perlu.
    int32_t actualSampleRate() const;

    // true kalau stream jatuh ke OpenSLES (AAudio gagal). OpenSLES tidak punya
    // jalur exclusive, jadi bit-perfect ke DAC tidak tersedia di jalur itu.
    bool usingOpenSLESFallback() const;

    void stop();

    bool isRunning() const;

    // =============================================
    // PLAYBACK SOURCE
    // =============================================

    void setPlaybackController(
        playback::PlaybackController* controller
    );

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
    // IMMERSIVE ENABLE
    // =============================================

    void setImmersiveEnabled(
        bool enabled
    );

    // =============================================
    // VISUALIZER
    // =============================================

    void getVisualizerData(
        float* dst,
        int32_t size
    ) const;

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