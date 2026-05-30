#pragma once

#include <atomic>
#include <memory>
#include <thread>
#include <string>

#include "../playback/PCMQueue.h"
#include "AudioDecoder.h"
#include "StreamResampler.h"

namespace pristine {

// =====================================================
// DECODER WORKER
// Dedicated decode thread
// Realtime-safe separation layer
// =====================================================

class DecoderWorker {
public:

    DecoderWorker();

    ~DecoderWorker();

    // =========================================
    // Decoder
    // =========================================

    void setDecoder(
        std::unique_ptr<audio::AudioDecoder>
            decoder
    );

    // =========================================
    // Queue
    // =========================================

    void setPCMQueue(
        PCMQueue* queue
    );

    // =========================================
    // Lifecycle
    // =========================================

    bool start(
        const std::string& uri
    );

    void stop();

    bool isRunning() const;

    // =========================================
    // Seeking
    // =========================================

    void seek(
        double seconds
    );

    // =========================================
    // Stream Info
    // =========================================

    pristine::AudioStreamInfo
    getStreamInfo() const;

private:

    void decodeLoop();

private:

    std::unique_ptr<
        audio::AudioDecoder
    > mDecoder;

    PCMQueue* mPCMQueue =
        nullptr;

    StreamResampler
        mResampler;

    std::unique_ptr<std::thread>
        mThread;

    std::atomic<bool>
        mRunning{false};

    std::atomic<bool>
        mStopRequested{false};

    std::atomic<bool>
        mSeekRequested{false};

    std::atomic<double>
        mSeekTargetSec{0.0};

    pristine::AudioStreamInfo
        mStreamInfo;
};

} // namespace pristine