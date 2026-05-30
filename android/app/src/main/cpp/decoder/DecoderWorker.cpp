#include "DecoderWorker.h"

#include <android/log.h>

#include <chrono>
#include <thread>

#define LOGD(...) \
__android_log_print( \
    ANDROID_LOG_DEBUG, \
    "DecoderWorker", \
    __VA_ARGS__ \
)

namespace pristine {

// =====================================================
// CTOR
// =====================================================

DecoderWorker::DecoderWorker() = default;

// =====================================================
// DTOR
// =====================================================

DecoderWorker::~DecoderWorker() {

    stop();
}

// =====================================================
// SET DECODER
// =====================================================

void DecoderWorker::setDecoder(
    std::unique_ptr<
        audio::AudioDecoder
    > decoder
) {

    mDecoder =
        std::move(decoder);
}

// =====================================================
// SET PCM QUEUE
// =====================================================

void DecoderWorker::setPCMQueue(
    PCMQueue* queue
) {

    mPCMQueue = queue;
}

// =====================================================
// START
// =====================================================

bool DecoderWorker::start(
    const std::string& uri
) {

    if (
        mRunning.load()
    ) {

        return true;
    }

    if (
        !mDecoder ||
        !mPCMQueue
    ) {

        LOGD(
            "Decoder or queue missing"
        );

        return false;
    }

    if (
        !mDecoder->open(uri)
    ) {

        LOGD(
            "Failed opening decoder"
        );

        return false;
    }

    const auto info =
        mDecoder->getStreamInfo();

    mStreamInfo.sampleRate =
        info.sampleRate;

    mStreamInfo.channels =
        info.channels;

    mStreamInfo.durationSec =
        info.durationSec;

    mStreamInfo.totalFrames =
        info.totalFrames;

    mStreamInfo.seekable =
        info.seekable;

    mStreamInfo.isStreaming =
        info.isStreaming;

    mResampler.configure(
        info.sampleRate,
        48000,
        info.channels
    );

    mStopRequested.store(false);

    mRunning.store(true);

    mThread =
        std::make_unique<std::thread>(
            &DecoderWorker::decodeLoop,
            this
        );

    return true;
}

// =====================================================
// STOP
// =====================================================

void DecoderWorker::stop() {

    mStopRequested.store(true);

    mRunning.store(false);

    if (
        mThread &&
        mThread->joinable()
    ) {

        mThread->join();
    }

    if (mDecoder) {

        mDecoder->close();
    }
}

// =====================================================
// IS RUNNING
// =====================================================

bool DecoderWorker::isRunning()
    const {

    return
        mRunning.load();
}

// =====================================================
// SEEK
// =====================================================

void DecoderWorker::seek(
    double seconds
) {

    mSeekTargetSec.store(
        seconds
    );

    mSeekRequested.store(true);
}

// =====================================================
// STREAM INFO
// =====================================================

pristine::AudioStreamInfo
DecoderWorker::getStreamInfo()
    const {

    return mStreamInfo;
}

// =====================================================
// DECODE LOOP
// =====================================================

void DecoderWorker::decodeLoop() {

    constexpr int32_t
        kDecodeFrames = 2048;

    while (
        !mStopRequested.load()
    ) {

        // =====================================
        // SEEK
        // =====================================

        if (
            mSeekRequested.load()
        ) {

            const double target =
                mSeekTargetSec.load();

            mDecoder->seek(target);

            mPCMQueue->clear();

            mResampler.reset();

            mSeekRequested.store(false);
        }

        // =====================================
        // BACKPRESSURE
        // =====================================

        if (
            mPCMQueue->freeFrames() <
            kDecodeFrames * 4
        ) {

            std::this_thread
                ::sleep_for(
                    std::chrono
                        ::milliseconds(4)
                );

            continue;
        }

        // =====================================
        // DECODE
        // =====================================

        audio::DecodedChunk
            decodedChunk;

        const bool ok =
            mDecoder
                ->decodeNextChunk(
                    decodedChunk,
                    kDecodeFrames
                );

        if (!ok) {

            LOGD(
                "Decode EOS"
            );

            break;
        }

        // =====================================
        // RESAMPLE
        // =====================================

        pristine::DecodedChunk
            inputChunk;

        inputChunk.pcm.data =
            decodedChunk.pcm.data;

        inputChunk.pcm.frames =
            decodedChunk.pcm.frames;

        inputChunk.pcm.channels =
            decodedChunk.pcm.channels;

        inputChunk.pcm.interleaved =
            true;

        inputChunk.pts =
            decodedChunk.pts;

        pristine::DecodedChunk
            outputChunk;

        mResampler.process(
            inputChunk,
            outputChunk
        );

        // =====================================
        // PUSH TO QUEUE
        // =====================================

        mPCMQueue->push(
            outputChunk.pcm.data,
            outputChunk.pcm.frames
        );
    }

    mRunning.store(false);
}

} // namespace pristine