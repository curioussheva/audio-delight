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
    bool open(
        oboe::AudioStreamCallback* callback,
        bool exclusive,
        int32_t requestedSampleRate = 0
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
        int32_t requestedSampleRate
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

    oboe::PerformanceMode mPerfMode =
        oboe::PerformanceMode::LowLatency;

    oboe::SharingMode mSharingMode =
        oboe::SharingMode::Shared;
};

} // namespace pristine