// =====================================================
// core/AudioEngine.h
// Production Modular Audio Engine
// =====================================================

#pragma once

#include <functional>
#include <memory>
#include <string>
#include "AudioCallback.h"
#include "AudioMetrics.h"
// (AudioModeManager.h dihapus 2026-11-10: class mati, 0 caller. Mode
// switching yang hidup ada di EngineManager::setProcessingMode.)
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
    // Dipasang SEKALI oleh EngineManager di konstruktornya (C-K2,
    // 2026-11-12) dan hanya diteruskan ke AudioStreamController — dulu
    // disimpan dulu di member lalu dipasang ulang tiap start() tanpa lock,
    // sementara thread error Oboe bisa membacanya: race. Kalau kosong,
    // tidak ada yang menangani dan audio akan mati sampai device berubah
    // lagi - perilaku lama yang justru jadi bug.
    void setStreamDisconnectHandler(
        std::function<void()> handler
    );

    // Laju yang BENAR-BENAR dipakai stream. Dipakai decoder sebagai target
    // resample supaya tidak ada konversi yang tidak perlu.
    //
    // PERHATIAN (logcat #23): ini laju SISI APP (lihat AudioStreamController).
    // Untuk gate bit-perfect pakai hardwareSampleRate() di bawah.
    int32_t actualSampleRate() const;

    // Laju HARDWARE stream (lihat AudioStreamController::hardwareSampleRate).
    // Dipakai HANYA oleh gate bit-perfect (EngineManager::isRateHonored).
    int32_t hardwareSampleRate() const;

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

    // true kalau jalur yang berjalan memang tidak bisa bit-perfect:
    // perangkat tidak punya jalur langsung (Bluetooth/A2DP) atau stream
    // jatuh ke OpenSLES. Speaker/jack TIDAK termasuk: di HP ber-MMAP
    // jalur internal bisa exclusive (F1, 2026-11-16).
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
    // RENDER UNTUK BACKEND OUTPUT KEDUA (USB Direct)
    // =============================================
    //
    // renderForUsbOutput() = AudioCallback::renderFrames() — frame yang
    // SAMA PERSIS dengan yang dikirim ke Oboe, hanya pemanggilnya worker
    // thread USB (lihat usb/UsbDirectOutput.h). Dipanggil HANYA saat
    // stream Oboe berhenti (invarian satu render thread, EngineManager).
    // setRenderSampleRate() menyetel laju render (decoder me-resample ke
    // laju ini); dipanggil EngineManager saat pindah backend, dan
    // start() mengembalikannya ke laju stream saat kembali ke Oboe.
    void renderForUsbOutput(
        float* out,
        int32_t numFrames
    );

    void setRenderSampleRate(
        int32_t sampleRate
    );

    // =============================================
    // MODE
    // =============================================

    void setProcessingMode(
        ProcessingMode mode
    );

    ProcessingMode
    getProcessingMode() const;

    // (B15-M1, 2026-11-15): hitung ulang metrik dspEnabled dari kondisi
    // gabungan saat ini (mode + gate). Dipanggil dari JNI sesudah
    // DSPProcessingGate::setEnabled — gate hidup di luar engine dan tidak
    // memegang metrics, jadi pembaruan metriknya lewat sini.
    void refreshDSPEnabledMetric();

    // =============================================
    // DSP CONTROL
    // =============================================

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

    // Reverb (2026-11-19): preset 0..6, 0 = Off. Disimpan di AudioState,
    // dibaca tiap buffer oleh AudioCallback::updateParameters().
    void setReverbPreset(
        int preset
    );

    // HRTF (2026-11-19): virtual speaker ±30° (HRTFNode). Disimpan di
    // AudioState, dibaca tiap buffer oleh updateParameters().
    void setHrtfEnabled(
        bool enabled
    );

    // Master EQ (P0-1, 2026-11-19): sakelar master "Pemrosesan DSP".
    // Disimpan di AudioState, dibaca tiap buffer oleh updateParameters(),
    // diteruskan AudioPipeline -> DSPConfig.enabled.
    void setEqEnabled(
        bool enabled
    );

    // =============================================
    // KOREKSI HEADPHONE (Fase D)
    // =============================================
    //
    // Menerima TEKS preset (format AutoEQ/Squiglink). Parsing dilakukan DI
    // SINI — di thread pemanggil (UI thread), bukan di audio thread. Hasilnya
    // dikonversi ke bentuk POD lalu disimpan lewat seqlock.
    //
    // Mengembalikan false kalau preset tidak bisa dibaca. Pemanggil WAJIB
    // memeriksa: preset cacat ditolak, bukan diterapkan sebagian.
    bool loadHeadphonePreset(
        const std::string& presetText,
        const std::string& name = ""
    );

    // Parse SAJA: memvalidasi teks preset tanpa mengubah state audio.
    //
    // Dipakai alur impor di UI. Tanpa ini, satu-satunya cara memvalidasi adalah
    // `loadHeadphonePreset()`, yang juga LANGSUNG menerapkan preset — artinya
    // menekan "periksa" pada preset yang belum ingin dipakai akan mengubah
    // suara yang sedang keluar.
    //
    // Mengembalikan jumlah filter aktif, atau -1 kalau preset ditolak.
    int validateHeadphonePreset(
        const std::string& presetText
    ) const;

    void clearHeadphonePreset();

    void setHeadphoneCorrectionEnabled(
        bool enabled
    );

    bool isHeadphoneCorrectionEnabled() const;

    void setEqBand(
        int band,
        float gainDb
    );

    // (C-EQATOM, 2026-11-12): tulis massal `count` band pertama (1..10)
    // dalam satu transaksi seqlock di AudioState.
    void setEqBands(
        const float* gains,
        int count
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

    // Akses metrik untuk EngineManager (diteruskan ke PlaybackController
    // supaya overrun decoder tercatat — M5, 2026-11-10).
    AudioMetrics& metrics() noexcept { return mMetrics; }

private:
    AudioState mState;
    AudioMetrics mMetrics;

    // (mBufferController dihapus 2026-11-12, C-FALLBACK: jalur fallback
    // AudioBufferController/RingBuffer dihapus — 0 pemanggil pushData.)

    AudioPipeline mPipeline;
    AudioCallback mCallback;

    AudioStreamController
        mStreamController;
};

} // namespace pristine 