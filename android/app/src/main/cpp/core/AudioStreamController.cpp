// =====================================================
// core/AudioStreamController.cpp
// =====================================================

#include "AudioStreamController.h"


#include <android/log.h>
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
    bool exclusive,
    int32_t requestedSampleRate
) {

    close();

    mOpenSLESFallback.store(false, std::memory_order_release);

    // =============================================
    // PERCOBAAN 1: AAudio
    // =============================================
    //
    // AAudio adalah jalur utama karena punya mode Exclusive - satu-satunya
    // cara mengirim sampel ke DAC tanpa melewati mixer Android, dan syarat
    // untuk bit-perfect. OpenSLES tidak punya mode itu.
    //
    // AAudio tersedia sejak Android 8.0 (API 26). Kalau perangkat lebih lama,
    // atau AAudio gagal membuka stream (mis. driver bermasalah), kita jatuh
    // ke OpenSLES di bawah - hanya sebagai fallback.
    {
        oboe::AudioStreamBuilder builder;

        if (!buildStream(builder, callback, exclusive, requestedSampleRate)) {
            return false;
        }
        builder.setAudioApi(oboe::AudioApi::AAudio);

        std::shared_ptr<oboe::AudioStream> stream;
        const auto result = builder.openStream(stream);

        if (result == oboe::Result::OK && stream) {
            mStream = std::move(stream);
            __android_log_print(ANDROID_LOG_INFO, "AudioStreamController",
                "open: AAudio BERHASIL (requested=%d, actual=%d, exclusive=%s)",
                requestedSampleRate, mStream->getSampleRate(),
                exclusive ? "ya" : "tidak");
        } else {
            __android_log_print(ANDROID_LOG_WARN, "AudioStreamController",
                "open: AAudio gagal (%s) - mencoba OpenSLES fallback",
                oboe::convertToText(result));
        }
    }

    // =============================================
    // PERCOBAAN 2: OpenSLES (fallback device lama)
    // =============================================
    if (!mStream) {
        oboe::AudioStreamBuilder builder;

        if (!buildStream(builder, callback, exclusive, requestedSampleRate)) {
            return false;
        }
        builder.setAudioApi(oboe::AudioApi::OpenSLES);

        std::shared_ptr<oboe::AudioStream> stream;
        const auto result = builder.openStream(stream);

        if (result != oboe::Result::OK || !stream) {
            __android_log_print(ANDROID_LOG_ERROR, "AudioStreamController",
                "open: AAudio DAN OpenSLES gagal (%s)",
                oboe::convertToText(result));
            return false;
        }

        mStream = std::move(stream);
        mOpenSLESFallback.store(true, std::memory_order_release);

        // Penting: di OpenSLES tidak ada jalur exclusive, jadi sampel SELALU
        // lewat mixer sistem. Dicatat sebagai peringatan supaya tidak
        // dilaporkan sebagai bit-perfect padahal bukan.
        __android_log_print(ANDROID_LOG_WARN, "AudioStreamController",
            "open: OpenSLES fallback dipakai (actual=%d). "
            "TIDAK ada jalur exclusive - bit-perfect ke DAC tidak tersedia "
            "di jalur ini.",
            mStream->getSampleRate());
    }

    // ð¥ DEBUG: log actual stream rate
    {
        int32_t actualRate = mStream ? mStream->getSampleRate() : 0;
        int32_t actualFrames = mStream ? mStream->getFramesPerBurst() : 0;
        __android_log_print(ANDROID_LOG_INFO, "AudioStreamController",
            "OPEN RESULT: ACTUAL rate=%d, framesPerBurst=%d, api=%s",
            actualRate, actualFrames,
            mStream ? oboe::convertToText(mStream->getAudioApi()) : "?");

        // Laju berbeda dari yang diminta = device/DAC tidak mendukung laju itu.
        // Bukan error fatal: yang penting decoder TAHU laju sebenarnya supaya
        // resample-nya benar. Sebelumnya dibandingkan dengan konstanta 48000,
        // yang salah begitu laju bisa diminta dinamis.
        if (requestedSampleRate > 0 && actualRate != requestedSampleRate) {
            __android_log_print(ANDROID_LOG_WARN, "AudioStreamController",
                "RATE MISMATCH: diminta=%d, dapat=%d (rasio %.3fx) - "
                "device/DAC tidak mendukung laju itu",
                requestedSampleRate, actualRate,
                static_cast<float>(actualRate) / static_cast<float>(requestedSampleRate));
        }
    }

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
    bool exclusive,
    int32_t requestedSampleRate
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

    // Laju diminta eksplisit, bukan dipatok 48000.
    //
    // Ini syarat bit-perfect: kalau file 96 kHz, stream harus dibuka di 96 kHz
    // supaya sampel tidak dikonversi di mixer Android. Pemanggil yang menentukan
    // laju (dari kapabilitas DAC atau laju file); kalau 0, pakai 48000 sebagai
    // default yang aman.
    //
    // CATATAN: setAudioApi() TIDAK di sini. Pemilihan API dilakukan di open()
    // supaya bisa mencoba AAudio dulu lalu jatuh ke OpenSLES.
    builder.setSampleRate(
        requestedSampleRate > 0 ? requestedSampleRate : 48000
    );

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

// Laju yang BENAR-BENAR dipakai stream. Sumber kebenaran untuk memberi tahu
// decoder laju mana yang harus dijadikan target resample.
int32_t AudioStreamController::actualSampleRate() const noexcept {
    return mStream ? mStream->getSampleRate() : mSampleRate;
}

bool AudioStreamController::usingOpenSLESFallback() const noexcept {
    return mOpenSLESFallback.load(std::memory_order_acquire);
}

int32_t AudioStreamController::sampleRate() const noexcept {

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