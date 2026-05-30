#include "PCMDecoder.h"

#include <android/log.h>

#include <fstream>
#include <vector>
#include <cstring>

#define LOGD(...) \
__android_log_print( \
    ANDROID_LOG_DEBUG, \
    "PCMDecoder", \
    __VA_ARGS__ \
)

namespace pristine {

// =====================================================
// INTERNAL IMPL
// =====================================================

struct PCMDecoder::Impl {

    bool open = false;

    std::ifstream file;

    AudioStreamInfo streamInfo;

    uint64_t framesRead = 0;

    double currentPosition = 0.0;

    // reusable decode buffer
    std::vector<float> decodeBuffer;
};

// =====================================================
// CTOR
// =====================================================

PCMDecoder::PCMDecoder()
    : mImpl(
        std::make_unique<Impl>()
    ) {
}

// =====================================================
// DTOR
// =====================================================

PCMDecoder::~PCMDecoder() {

    close();
}

// =====================================================
// OPEN
// =====================================================

bool PCMDecoder::open(
    const std::string& uri
) {

    LOGD(
        "PCM open: %s",
        uri.c_str()
    );

    close();

    mImpl->file.open(
        uri,
        std::ios::binary
    );

    if (!mImpl->file.is_open()) {

        LOGD(
            "Failed open PCM"
        );

        return false;
    }

    mImpl->open = true;

    // =========================================
    // STUB FORMAT
    // =========================================
    // Future:
    // parse WAV/RAW headers
    // =========================================

    mImpl->streamInfo.sampleRate =
        44100;

    mImpl->streamInfo.channels =
        2;

    mImpl->streamInfo.format =
        AudioFormat::PCM_F32;

    mImpl->streamInfo.seekable =
        true;

    mImpl->streamInfo.isStreaming =
        false;

    mImpl->framesRead = 0;

    mImpl->currentPosition = 0.0;

    return true;
}

// =====================================================
// CLOSE
// =====================================================

void PCMDecoder::close() {

    if (mImpl->file.is_open()) {

        mImpl->file.close();
    }

    mImpl->decodeBuffer.clear();

    mImpl->open = false;
}

// =====================================================
// IS OPEN
// =====================================================

bool PCMDecoder::isOpen()
    const {

    return mImpl->open;
}

// =====================================================
// STREAM INFO
// =====================================================

AudioStreamInfo
PCMDecoder::getStreamInfo()
    const {

    return mImpl->streamInfo;
}

// =====================================================
// DECODE
// =====================================================

bool PCMDecoder::decodeNextChunk(
    DecodedChunk& outChunk,
    int32_t targetFrames
) {

    if (!mImpl->open) {

        return false;
    }

    const int channels =
        mImpl->streamInfo.channels;

    const size_t sampleCount =
        static_cast<size_t>(
            targetFrames * channels
        );

    mImpl->decodeBuffer.resize(
        sampleCount
    );

    const size_t bytesToRead =
        sampleCount * sizeof(float);

    mImpl->file.read(
        reinterpret_cast<char*>(
            mImpl->decodeBuffer.data()
        ),
        static_cast<std::streamsize>(
            bytesToRead
        )
    );

    const size_t bytesRead =
        static_cast<size_t>(
            mImpl->file.gcount()
        );

    const size_t samplesRead =
        bytesRead / sizeof(float);

    const int framesRead =
        static_cast<int>(
            samplesRead / channels
        );

    if (framesRead <= 0) {

        outChunk.endOfStream =
            true;

        return false;
    }

    outChunk.pcm.data =
        mImpl->decodeBuffer.data();

    outChunk.pcm.frames =
        framesRead;

    outChunk.pcm.channels =
        channels;

    outChunk.pcm.interleaved =
        true;

    outChunk.pts =
        mImpl->currentPosition;

    outChunk.endOfStream =
        false;

    outChunk.discontinuity =
        false;

    mImpl->framesRead +=
        framesRead;

    mImpl->currentPosition =
        static_cast<double>(
            mImpl->framesRead
        ) /
        static_cast<double>(
            mImpl->streamInfo.sampleRate
        );

    return true;
}

// =====================================================
// SEEK
// =====================================================

void PCMDecoder::seek(
    double seconds
) {

    if (
        !mImpl->open ||
        !mImpl->file.is_open()
    ) {

        return;
    }

    const int64_t targetFrame =
        static_cast<int64_t>(
            seconds *
            mImpl->streamInfo.sampleRate
        );

    const int channels =
        mImpl->streamInfo.channels;

    const int64_t byteOffset =
        targetFrame *
        channels *
        sizeof(float);

    mImpl->file.clear();

    mImpl->file.seekg(
        byteOffset,
        std::ios::beg
    );

    mImpl->framesRead =
        static_cast<uint64_t>(
            targetFrame
        );

    mImpl->currentPosition =
        seconds;

    LOGD(
        "PCM seek %.3f",
        seconds
    );
}

// =====================================================
// POSITION
// =====================================================

double PCMDecoder::getCurrentPosition()
    const {

    return mImpl->currentPosition;
}

} // namespace pristine