// =====================================================
// core/AudioStreamController.cpp
// =====================================================

#include "AudioStreamController.h"

#include <utility>

namespace pristine {

// =====================================================
// CONSTRUCTOR
// =====================================================

AudioStreamController::
AudioStreamController() = default;

// =====================================================
// DESTRUCTOR
// =====================================================

AudioStreamController::
~AudioStreamController() {

    close();
}

// =====================================================
// OPEN
// =====================================================

bool AudioStreamController::open(
    oboe::AudioStreamCallback* callback,
    bool exclusive
) {

    close();

    oboe::AudioStreamBuilder builder;

    if (
        !buildStream(
            builder,
            callback,
            exclusive
        )
    ) {
        return false;
    }

    std::shared_ptr<oboe::AudioStream>
        stream;

    const auto result =
        builder.openStream(stream);

    if (
        result != oboe::Result::OK ||
        !stream
    ) {
        return false;
    }

    mStream =
        std::move(stream);

    // =============================================
    // CACHE STREAM INFO
    // =============================================

    mSampleRate =
        mStream->getSampleRate();

    mChannelCount =
        mStream->getChannelCount();

    mFramesPerBurst =
        mStream->getFramesPerBurst();

    mFormat =
        mStream->getFormat();

    mApi =
        mStream->getAudioApi();

    mPerfMode =
        mStream->getPerformanceMode();

    mSharingMode =
        mStream->getSharingMode();

    mExclusive.store(
        mSharingMode ==
        oboe::SharingMode::Exclusive,
        std::memory_order_release
    );

    return true;
}

// =====================================================
// BUILD STREAM
// =====================================================

bool AudioStreamController::buildStream(
    oboe::AudioStreamBuilder& builder,
    oboe::AudioStreamCallback* callback,
    bool exclusive
) {

    builder.setDirection(
        oboe::Direction::Output
    );

    builder.setPerformanceMode(
        oboe::PerformanceMode::LowLatency
    );

    builder.setSharingMode(
        exclusive
        ? oboe::SharingMode::Exclusive
        : oboe::SharingMode::Shared
    );

    builder.setFormat(
        oboe::AudioFormat::Float
    );

    builder.setChannelCount(2);

    builder.setSampleRate(48000);

    builder.setFramesPerCallback(
        oboe::Unspecified
    );

    builder.setDataCallback(
        callback
    );

    builder.setErrorCallback(
        this
    );

    return true;
}

// =====================================================
// START
// =====================================================

bool AudioStreamController::start() {

    if (!mStream) {
        return false;
    }

    const auto result =
        mStream->requestStart();

    if (result != oboe::Result::OK) {
        return false;
    }

    mRunning.store(
        true,
        std::memory_order_release
    );

    return true;
}

// =====================================================
// STOP
// =====================================================

void AudioStreamController::stop() {

    if (!mStream) {
        return;
    }

    mStream->requestStop();

    mRunning.store(
        false,
        std::memory_order_release
    );
}

// =====================================================
// CLOSE
// =====================================================

void AudioStreamController::close() {

    mRunning.store(
        false,
        std::memory_order_release
    );

    if (mStream) {

        mStream->close();

        mStream.reset();
    }
}

// =====================================================
// RESTART
// =====================================================

bool AudioStreamController::restart(
    oboe::AudioStreamCallback* callback
) {

    const bool exclusive =
        isExclusive();

    close();

    if (
        !open(
            callback,
            exclusive
        )
    ) {
        return false;
    }

    return start();
}

// =====================================================
// IS OPEN
// =====================================================

bool AudioStreamController::isOpen()
const noexcept {

    return mStream != nullptr;
}

// =====================================================
// IS RUNNING
// =====================================================

bool AudioStreamController::isRunning()
const noexcept {

    return mRunning.load(
        std::memory_order_acquire
    );
}

// =====================================================
// IS EXCLUSIVE
// =====================================================

bool AudioStreamController::isExclusive()
const noexcept {

    return mExclusive.load(
        std::memory_order_acquire
    );
}

// =====================================================
// SAMPLE RATE
// =====================================================

int32_t AudioStreamController::sampleRate()
const noexcept {

    return mSampleRate;
}

// =====================================================
// CHANNEL COUNT
// =====================================================

int32_t AudioStreamController::channelCount()
const noexcept {

    return mChannelCount;
}

// =====================================================
// FRAMES PER BURST
// =====================================================

int32_t AudioStreamController::framesPerBurst()
const noexcept {

    return mFramesPerBurst;
}

// =====================================================
// FORMAT
// =====================================================

oboe::AudioFormat
AudioStreamController::format()
const noexcept {

    return mFormat;
}

// =====================================================
// API
// =====================================================

oboe::AudioApi
AudioStreamController::api()
const noexcept {

    return mApi;
}

// =====================================================
// PERFORMANCE MODE
// =====================================================

oboe::PerformanceMode
AudioStreamController::performanceMode()
const noexcept {

    return mPerfMode;
}

// =====================================================
// SHARING MODE
// =====================================================

oboe::SharingMode
AudioStreamController::sharingMode()
const noexcept {

    return mSharingMode;
}

// =====================================================
// STREAM
// =====================================================

oboe::AudioStream*
AudioStreamController::stream()
noexcept {

    return mStream.get();
}

// =====================================================
// ERROR CALLBACK
// =====================================================

void AudioStreamController::
onErrorAfterClose(
    oboe::AudioStream*,
    oboe::Result
) {

    mRunning.store(
        false,
        std::memory_order_release
    );

    mStream.reset();
}

} // namespace pristine