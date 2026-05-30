#include "FFmpegDecoder.h"

#include <android/log.h>

#define LOGD(...) \
__android_log_print( \
    ANDROID_LOG_DEBUG, \
    "FFmpegDecoder", \
    __VA_ARGS__ \
)

namespace pristine {

// =====================================================
// INTERNAL IMPL
// =====================================================

struct FFmpegDecoder::Impl {

    bool open = false;

    double currentPosition = 0.0;

    AudioStreamInfo streamInfo;

    // =========================================
    // FFmpeg contexts (future)
    // =========================================

    // AVFormatContext* formatCtx = nullptr;
    // AVCodecContext* codecCtx = nullptr;
    // SwrContext* swrCtx = nullptr;
    // AVFrame* frame = nullptr;
    // AVPacket* packet = nullptr;

    // =========================================
    // Internal decode buffer
    // =========================================

    PCMBufferView pcmView;

    // realtime-safe reusable buffer
    std::vector<float> decodeBuffer;
};

// =====================================================
// CTOR
// =====================================================

FFmpegDecoder::FFmpegDecoder()
    : mImpl(
        std::make_unique<Impl>()
    ) {
}

// =====================================================
// DTOR
// =====================================================

FFmpegDecoder::~FFmpegDecoder() {

    close();
}

// =====================================================
// OPEN
// =====================================================

bool FFmpegDecoder::open(
    const std::string& uri
) {

    LOGD(
        "Open decoder: %s",
        uri.c_str()
    );

    // =========================================
    // STUB IMPLEMENTATION
    // =========================================

    mImpl->open = true;

    mImpl->streamInfo.sampleRate =
        48000;

    mImpl->streamInfo.channels =
        2;

    mImpl->streamInfo.format =
        AudioFormat::PCM_F32;

    mImpl->streamInfo.durationSec =
        0.0;

    mImpl->streamInfo.seekable =
        true;

    mImpl->streamInfo.isStreaming =
        false;

    return true;
}

// =====================================================
// CLOSE
// =====================================================

void FFmpegDecoder::close() {

    if (!mImpl->open) {
        return;
    }

    LOGD(
        "Close decoder"
    );

    // =========================================
    // FUTURE:
    // avcodec_free_context()
    // avformat_close_input()
    // swr_free()
    // =========================================

    mImpl->decodeBuffer.clear();

    mImpl->open = false;
}

// =====================================================
// IS OPEN
// =====================================================

bool FFmpegDecoder::isOpen()
    const {

    return mImpl->open;
}

// =====================================================
// STREAM INFO
// =====================================================

AudioStreamInfo
FFmpegDecoder::getStreamInfo()
    const {

    return mImpl->streamInfo;
}

// =====================================================
// DECODE
// =====================================================

bool FFmpegDecoder::decodeNextChunk(
    DecodedChunk& outChunk,
    int32_t targetFrames
) {

    if (!mImpl->open) {

        return false;
    }

    // =========================================
    // STUB
    // =========================================

    mImpl->decodeBuffer.resize(
        targetFrames * 2
    );

    // silence
    memset(
        mImpl->decodeBuffer.data(),
        0,
        sizeof(float) *
        targetFrames * 2
    );

    outChunk.pcm.data =
        mImpl->decodeBuffer.data();

    outChunk.pcm.frames =
        targetFrames;

    outChunk.pcm.channels =
        2;

    outChunk.pcm.interleaved =
        true;

    outChunk.pts =
        mImpl->currentPosition;

    outChunk.endOfStream =
        false;

    outChunk.discontinuity =
        false;

    mImpl->currentPosition +=
        static_cast<double>(
            targetFrames
        ) /
        static_cast<double>(
            mImpl->streamInfo.sampleRate
        );

    return true;
}

// =====================================================
// SEEK
// =====================================================

void FFmpegDecoder::seek(
    double seconds
) {

    if (!mImpl->open) {
        return;
    }

    LOGD(
        "Seek %.3f",
        seconds
    );

    mImpl->currentPosition =
        seconds;

    // =========================================
    // FUTURE:
    // av_seek_frame()
    // avcodec_flush_buffers()
    // =========================================
}

// =====================================================
// CURRENT POSITION
// =====================================================

double FFmpegDecoder::getCurrentPosition()
    const {

    return mImpl->currentPosition;
}

} // namespace pristine