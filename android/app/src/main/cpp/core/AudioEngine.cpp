// =====================================================
// core/AudioEngine.cpp
// =====================================================

#include "AudioEngine.h"
#include "DeviceRateDetector.h"
#include <android/log.h>
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
    bool exclusiveMode,
    int32_t requestedSampleRate,
    int32_t requestedDeviceId
) {

    if (
        mState.isRunning()
    ) {
        return true;
    }

    // Laju 0 = pemanggil tidak menentukan: deteksi sendiri dari device/DAC.
    // Ini yang membuat laju tidak lagi hardcoded 48000.
    if (requestedSampleRate <= 0) {
        const int detected = audio::DeviceRateDetector::refresh();
        if (detected > 0) {
            // Pakai laju tertinggi yang didukung sebagai default saat tidak
            // ada file spesifik yang diminta - memberi ruang terbanyak untuk
            // laju file asli tanpa konversi.
            const auto& rates = audio::DeviceRateDetector::supportedRates();
            requestedSampleRate = rates.empty() ? 48000 : rates.back();
            __android_log_print(ANDROID_LOG_INFO, "AudioEngine",
                "start: laju dideteksi sendiri = %d (dari %d laju didukung)",
                requestedSampleRate, detected);
        } else {
            requestedSampleRate = 48000;
            __android_log_print(ANDROID_LOG_WARN, "AudioEngine",
                "start: deteksi laju gagal, pakai default %d", requestedSampleRate);
        }
    }

    if (
        !mStreamController.open(
            &mCallback,
            exclusiveMode,
            requestedSampleRate,
            requestedDeviceId
        )
    ) {
        return false;
    }

    // Pakai laju AKTUAL dari stream, bukan yang diminta - kalau device/DAC
    // tidak mendukung laju yang diminta, decoder harus tahu laju sebenarnya
    // supaya resample-nya benar dan tidak ada konversi tambahan.
    const int32_t actualRate = mStreamController.actualSampleRate();

    mPipeline.prepare(
        actualRate,
        mStreamController.framesPerBurst()
    );

    mCallback.setSampleRate(
        actualRate
    );

    __android_log_print(ANDROID_LOG_INFO, "AudioEngine",
        "start: diminta rate=%d device=%d, dipakai rate=%d device=%d, "
        "exclusive=%s, api=%s%s",
        requestedSampleRate, requestedDeviceId,
        actualRate, mStreamController.actualDeviceId(),
        exclusiveMode ? "ya" : "tidak",
        mStreamController.usingOpenSLESFallback() ? "OpenSLES" : "AAudio",
        mStreamController.usingOpenSLESFallback()
            ? " (TANPA jalur exclusive - bit-perfect ke DAC tidak tersedia)"
            : "");

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

int32_t AudioEngine::actualSampleRate() const {
    return mStreamController.actualSampleRate();
}

int32_t AudioEngine::actualDeviceId() const {
    return mStreamController.actualDeviceId();
}

bool AudioEngine::isDeviceHonored() const {
    // Tidak ada preferensi = tidak ada yang perlu dihormati.
    const int32_t requested = mStreamController.requestedDeviceId();
    if (requested <= 0) {
        return true;
    }
    return mStreamController.actualDeviceId() == requested;
}

bool AudioEngine::isExclusive() const {
    return mStreamController.isExclusive();
}

bool AudioEngine::usingOpenSLESFallback() const {
    return mStreamController.usingOpenSLESFallback();
}

bool AudioEngine::isPathInherentlyLossy() const {
    return mStreamController.isPathInherentlyLossy();
}

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