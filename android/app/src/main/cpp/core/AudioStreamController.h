#pragma once

#include <atomic>
#include <memory>

#include <oboe/Oboe.h>

#include "AudioState.h"

namespace pristine {

// =====================================================
// AUDIO STREAM CONTROLLER
// Handle Oboe stream lifecycle
// =====================================================

class AudioStreamController :
    public oboe::AudioStreamErrorCallback {

public:

    AudioStreamController();

    ~AudioStreamController() override;

    // =============================================
    // STREAM
    // =============================================

    // `requestedSampleRate` = laju yang DIINGINKAN (dari kapabilitas DAC atau
    // laju file). 0 = pakai default 48000.
    //
    // Diisi eksplisit supaya laju stream bisa mengikuti DAC/file, bukan
    // dipatok 48000 - itu syarat bit-perfect: sampel harus sampai ke DAC
    // pada laju aslinya, tanpa konversi di mixer Android.
    //
    // `deviceId` = id numerik perangkat output yang DIMINTA (dari
    // AudioDeviceManager::activeDeviceIdNumeric()). 0 = tidak ada preferensi,
    // Android yang memilih.
    //
    // 🔥 FIX (2026-10-07): parameter ini yang membuat pemilihan perangkat di
    // UI benar-benar berpengaruh. Sebelumnya tidak ada dan setDeviceId() tidak
    // pernah dipanggil, sehingga pilihan user tercatat tapi stream tetap
    // dibuka di perangkat default sistem (audio keluar dari speaker walau DAC
    // dipilih). Lihat docs/AUDIO_OUTPUT_PATHS.md §3.1.
    bool open(
        oboe::AudioStreamCallback* callback,
        bool exclusive,
        int32_t requestedSampleRate = 0,
        int32_t deviceId = 0
    );

    bool start();

    void stop();

    void close();

    bool restart(
        oboe::AudioStreamCallback* callback
    );

    // =============================================
    // STATE
    // =============================================

    bool isOpen() const noexcept;

    bool isRunning() const noexcept;

    bool isExclusive() const noexcept;

    int32_t sampleRate() const noexcept;

    int32_t channelCount() const noexcept;

    int32_t framesPerBurst() const noexcept;

    oboe::AudioFormat format() const noexcept;

    oboe::AudioApi api() const noexcept;

    oboe::PerformanceMode
    performanceMode() const noexcept;

    oboe::SharingMode
    sharingMode() const noexcept;

    oboe::AudioStream*
    stream() noexcept;

    // Laju yang BENAR-BENAR dipakai stream setelah dibuka. Bisa berbeda dari
    // yang diminta kalau device/DAC tidak mendukung laju itu. Dipakai untuk
    // memberi tahu decoder laju mana yang harus dipakai (target resample).
    int32_t actualSampleRate() const noexcept;

    // true kalau stream jatuh ke OpenSLES karena AAudio gagal. AAudio adalah
    // jalur utama (punya mode exclusive untuk bit-perfect); OpenSLES hanya
    // fallback untuk device lama yang tidak punya AAudio.
    bool usingOpenSLESFallback() const noexcept;

    // Id perangkat yang BENAR-BENAR dipakai stream setelah dibuka. 0 =
    // Android memilih sendiri (tidak ada preferensi yang diminta).
    //
    // Dipakai untuk verifikasi jujur: kalau yang diminta != yang didapat,
    // perangkat yang diminta tidak tersedia atau tidak bisa dibuka, dan UI
    // tidak boleh mengaku sedang memakai DAC itu.
    int32_t actualDeviceId() const noexcept;

    // Id perangkat yang diminta saat open() terakhir. 0 = tidak ada preferensi.
    int32_t requestedDeviceId() const noexcept {
        return mRequestedDeviceId.load(std::memory_order_acquire);
    }

    // Laju yang diminta saat open() terakhir (0 = diserahkan ke deteksi).
    int32_t requestedSampleRate() const noexcept {
        return mRequestedSampleRate.load(std::memory_order_acquire);
    }

    // true kalau stream yang berjalan benar-benar memakai perangkat yang
    // diminta. Kalau false, pilihan device tidak dihormati - UI harus jujur
    // dan tidak mengaku sedang memakai DAC itu.
    bool isDeviceHonored() const noexcept;

    // true kalau stream yang berjalan TIDAK bisa bit-perfect secara arsitektur,
    // apa pun yang diminta user.
    //
    // Dua sebab:
    //   1. Perangkatnya sendiri tidak punya jalur langsung ke perangkat keras
    //      (speaker internal, jack headset, Bluetooth/A2DP - semuanya lewat
    //      mixer AudioFlinger).
    //   2. Stream jatuh ke OpenSLES, yang tidak punya mode exclusive.
    //
    // Dipakai UI supaya tidak pernah mengklaim bit-perfect pada jalur yang
    // mustahil - dan supaya jalur yang MUNGKIN (USB DAC lewat AAudio) tidak
    // ikut-ikutan dinyatakan gagal. Lihat docs/AUDIO_OUTPUT_PATHS.md.
    bool isPathInherentlyLossy() const noexcept;

    // =============================================
    // ERROR CALLBACK
    // =============================================

    void onErrorAfterClose(
        oboe::AudioStream* stream,
        oboe::Result error
    ) override;

private:

    bool buildStream(
        oboe::AudioStreamBuilder& builder,
        oboe::AudioStreamCallback* callback,
        bool exclusive,
        int32_t requestedSampleRate,
        int32_t deviceId
    );

private:

    std::shared_ptr<
        oboe::AudioStream
    > mStream;

    std::atomic<bool>
        mRunning{false};

    std::atomic<bool>
        mExclusive{false};

    int32_t mSampleRate = 48000;

    int32_t mChannelCount = 2;

    int32_t mFramesPerBurst = 0;

    oboe::AudioFormat mFormat =
        oboe::AudioFormat::Float;

    oboe::AudioApi mApi =
        oboe::AudioApi::Unspecified;

    // true kalau AAudio gagal dan stream dibuka ulang dengan OpenSLES.
    std::atomic<bool> mOpenSLESFallback{false};

    // Nilai yang diminta saat open() terakhir. Disimpan supaya restart()
    // membuka ulang stream dengan laju dan perangkat yang SAMA - kalau tidak,
    // restart diam-diam kembali ke default (48000 + perangkat sistem) dan
    // membatalkan pilihan laju maupun DAC.
    std::atomic<int32_t> mRequestedSampleRate{0};
    std::atomic<int32_t> mRequestedDeviceId{0};

    // Id perangkat yang benar-benar dipakai stream. 0 = dipilih sistem.
    std::atomic<int32_t> mActualDeviceId{0};

    oboe::PerformanceMode mPerfMode =
        oboe::PerformanceMode::LowLatency;

    oboe::SharingMode mSharingMode =
        oboe::SharingMode::Shared;
};

} // namespace pristine