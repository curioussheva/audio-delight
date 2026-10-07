#pragma once

#include <atomic>
#include <mutex>

#include "../core/AudioEngine.h"
#include "../core/AudioState.h"
#include "../core/DeviceRateDetector.h"
#include "../playback/PlaybackController.h"

namespace pristine {

class __attribute__((visibility("default"))) EngineManager {
public:

    static EngineManager& get();

    AudioEngine& engine();

    playback::PlaybackController&
    playback();

    AudioState&
    state();

    // lifecycle
    void start();
    void stop();

    // Laju stream yang diminta, dipilih dari laju FILE lewat kapabilitas
    // perangkat (DeviceRateDetector::pickBestRate).
    //
    // Tanpa ini stream selalu dibuka di laju TERTINGGI yang didukung
    // perangkat, bukan laju file — file 44.1 kHz di DAC 384 kHz jadi
    // upsampling 8.7x, kebalikan dari bit-perfect.
    //
    // fileRate <= 0 = laju file tidak diketahui -> biarkan engine mendeteksi
    // sendiri (perilaku lama, laju tertinggi perangkat).
    //
    // Nilai ini disimpan dan dipakai ulang saat toggle exclusive mode, supaya
    // stream yang dibuka ulang tidak kembali ke laju tertinggi perangkat.
    void setRequestedSampleRate(int32_t fileRate);

    // Laju yang diminta saat ini. 0 = belum ditentukan / auto.
    int32_t requestedSampleRate() const;

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

    // Status stream AKTUAL, bukan yang diminta. Lihat AudioEngine::isExclusive.
    bool isExclusive() const;
    int32_t actualSampleRate() const;

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

    // Laju yang akan dipakai stream berikutnya, dalam Hz.
    // Prioritas: override eksplisit (setRequestedSampleRate) -> laju file dari
    // controller (diisi loadTrack) -> 0 (biar engine deteksi sendiri).
    // Dipanggil hanya saat mMutex sudah dipegang (start/toggle exclusive).
    int32_t resolveRequestedRate() const;

private:

    mutable std::mutex mMutex;

    AudioState mState;

    // Laju stream yang diminta (hasil pickBestRate dari laju file).
    // 0 = belum ditentukan -> engine mendeteksi sendiri dari perangkat.
    // Atomic karena dibaca tanpa mMutex (requestedSampleRate() const).
    std::atomic<int32_t> mRequestedSampleRate{0};

    AudioEngine mEngine;

    playback::PlaybackController mPlayback;
};

} // namespace pristine 


