// =====================================================
// core/AudioEngine.h
// Production Modular Audio Engine
// =====================================================

#pragma once

#include <functional>
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
    //
    // `requestedDeviceId` = id numerik perangkat output yang diminta (dari
    // AudioDeviceManager). 0 = tidak ada preferensi, Android yang memilih.
    // Diisi supaya pilihan DAC benar-benar dipakai, bukan hanya tercatat.
    bool start(
        bool exclusiveMode = false,
        int32_t requestedSampleRate = 0,
        int32_t requestedDeviceId = 0
    );

    // =============================================
    // STREAM DISCONNECT
    // =============================================

    // Dipanggil saat stream DIPUTUS PAKSA oleh sistem (headset dicolok,
    // perubahan rute). Sudah tidak ada stream yang bisa dipakai saat ini:
    // pemilik (EngineManager) yang tahu cara membuka ulang + memuat ulang
    // track ke stream baru.
    //
    // Dipasang oleh EngineManager saat initialize(); kalau kosong, tidak ada
    // yang menangani dan audio akan mati sampai device berubah lagi -
    // perilaku lama yang justru jadi bug.
    void setStreamDisconnectHandler(
        std::function<void()> handler
    );

    // Laju yang BENAR-BENAR dipakai stream. Dipakai decoder sebagai target
    // resample supaya tidak ada konversi yang tidak perlu.
    int32_t actualSampleRate() const;

    // Id perangkat yang BENAR-BENAR dipakai stream. 0 = dipilih sistem.
    // Bandingkan dengan yang diminta untuk tahu apakah pilihan dihormati.
    int32_t actualDeviceId() const;

    // true kalau stream yang berjalan memakai perangkat yang diminta.
    bool isDeviceHonored() const;

    // true kalau Oboe stream BENAR-BENAR exclusive (AAudio menerimanya).
    //
    // Berbeda dari exclusiveMode() (AudioState) yang cuma mencatat APA YANG
    // DIMINTA. AAudio bisa menolak exclusive — Oboe otomatis fallback ke
    // shared, dan kita wajib jujur soal itu ke user: bit-perfect tidak
    // tercapai kalau ini false meski mode bit-perfect dipilih.
    bool isExclusive() const;

    // true kalau stream jatuh ke OpenSLES (AAudio gagal). OpenSLES tidak punya
    // jalur exclusive, jadi bit-perfect ke DAC tidak tersedia di jalur itu.
    bool usingOpenSLESFallback() const;

    // true kalau jalur yang berjalan memang tidak bisa bit-perfect: perangkat
    // tidak punya jalur langsung (speaker/jack/Bluetooth) atau stream jatuh ke
    // OpenSLES.
    //
    // Dipakai UI supaya pembedakan "memang tidak mungkin" dari "mungkin tapi
    // ditolak". Lihat AudioStreamController::isPathInherentlyLossy().
    bool isPathInherentlyLossy() const;

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

    // Diteruskan ke mStreamController sebagai disconnect handler; diset oleh
    // EngineManager. Lihat setStreamDisconnectHandler().
    std::function<void()> mStreamDisconnectHandler;

    AudioStreamController
        mStreamController;
};

} // namespace pristine 