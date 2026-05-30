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

    bool open(
        oboe::AudioStreamCallback* callback,
        bool exclusive
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
        bool exclusive
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

    oboe::PerformanceMode mPerfMode =
        oboe::PerformanceMode::LowLatency;

    oboe::SharingMode mSharingMode =
        oboe::SharingMode::Shared;
};

} // namespace pristine