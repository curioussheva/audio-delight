// =====================================================
// manager/EngineManager.cpp
// =====================================================

#include "EngineManager.h"

#include <android/log.h>

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

    // Laju stream DIPILIH DARI LAJU FILE, bukan dari laju tertinggi perangkat.
    //
    // pickBestRate() mengembalikan laju file kalau perangkat mendukungnya
    // (bit-perfect, tanpa konversi sama sekali), lalu kelipatan bulat
    // terdekat, baru laju tertinggi yang didukung. Sebelum ini argumen kedua
    // mEngine.start() tidak pernah diisi sehingga selalu 0 -> engine memilih
    // laju TERTINGGI perangkat (file 44.1 kHz di DAC 384 kHz = upsampling 8.7x).
    const int32_t fileRate = resolveRequestedRate();

    int32_t requestedRate = fileRate;
    if (requestedRate > 0) {
        requestedRate = audio::DeviceRateDetector::pickBestRate(requestedRate);
        __android_log_print(ANDROID_LOG_INFO, "EngineManager",
            "start: laju file=%d -> laju stream=%d (bit-perfect=%s)",
            fileRate,
            requestedRate,
            audio::DeviceRateDetector::isBitPerfectFor(fileRate) ? "ya" : "tidak");
    } else {
        __android_log_print(ANDROID_LOG_INFO, "EngineManager",
            "start: laju file tidak diketahui -> engine deteksi sendiri");
    }

    if (!mPlayback.isInitialized()) {
        mPlayback.initialize();
    }

    mEngine.setPlaybackController(&mPlayback);

    mEngine.start(
        exclusiveMode,
        requestedRate
    );
}

// =====================================================
// REQUESTED SAMPLE RATE
// =====================================================

void EngineManager::setRequestedSampleRate(
    int32_t fileRate
) {

    std::lock_guard<std::mutex>
        lock(mMutex);

    // Baru diadopsi sebagai laju stream saat start() berikutnya - stream yang
    // sedang berjalan tidak diubah di sini. Mengubah laju satu stream yang
    // sudah terbuka berarti menutup dan membukanya ulang, dan itu keputusan
    // pemanggil (buka stream di laju lain), bukan efek samping setter.
    const int32_t prev =
        mRequestedSampleRate.exchange(
            fileRate,
            std::memory_order_acq_rel
        );

    if (prev != fileRate) {
        __android_log_print(ANDROID_LOG_INFO, "EngineManager",
            "setRequestedSampleRate: %d -> %d Hz",
            prev, fileRate);
    }
}

int32_t EngineManager::requestedSampleRate() const {

    return mRequestedSampleRate.load(
        std::memory_order_acquire
    );
}

// Prioritas: override eksplisit -> laju file dari controller (loadTrack).
//
// Controller dijadikan sumber kedua karena jalur normal memang lewat sana:
// JS memuat track (loadTrack) sebelum engine start, dan loadTrack-lah yang
// tahu laju track. Override eksplisit (setRequestedSampleRate) menang karena
// itu preferensi yang sengaja diminta pemanggil.
int32_t EngineManager::resolveRequestedRate() const {

    const int32_t explicitRate =
        mRequestedSampleRate.load(std::memory_order_acquire);

    if (explicitRate > 0) {
        return explicitRate;
    }

    const uint32_t fileRate =
        mPlayback.currentFileSampleRate();

    if (fileRate >= 8000 && fileRate <= 768000) {
        return static_cast<int32_t>(fileRate);
    }

    return 0;
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

        // Stream dibuka ULANG di sini. Kalau laju tidak diteruskan, toggle
        // exclusive mode mengembalikan stream ke laju tertinggi perangkat
        // dan membatalkan pilihan laju file yang sudah ditetapkan.
        const int32_t fileRate = resolveRequestedRate();

        int32_t requestedRate = fileRate;
        if (requestedRate > 0) {
            requestedRate = audio::DeviceRateDetector::pickBestRate(requestedRate);
        }

        mEngine.start(
            enabled,
            requestedRate
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

bool EngineManager::isExclusive() const {
    return mEngine.isExclusive();
}

int32_t EngineManager::actualSampleRate() const {
    return mEngine.actualSampleRate();
}

} // namespace pristine 