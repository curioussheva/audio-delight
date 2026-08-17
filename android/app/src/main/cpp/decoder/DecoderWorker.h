#pragma once

#include "AudioDecoder.h"

#include <atomic>
#include <condition_variable>
#include <functional>
#include <memory>
#include <mutex>
#include <string>
#include <thread>

namespace pristine::decoder {

// =====================================================
// DECODED CHUNK CALLBACK
// =====================================================

using DecodeCallback =
    std::function<void(DecodeResult&&)>;

using ErrorCallback =
    std::function<void(const std::string&)>;

using EofCallback =
    std::function<void()>;

// =====================================================
// DECODER WORKER
// =====================================================

class DecoderWorker {
public:
    explicit DecoderWorker(
        std::unique_ptr<AudioDecoder> decoder);

    ~DecoderWorker();

    DecoderWorker(const DecoderWorker&) = delete;
    DecoderWorker& operator=(const DecoderWorker&) = delete;

    // =============================================
    // Lifecycle
    // =============================================

    bool start(
        const std::string& uri,
        double startPosition = 0.0);

    void stop();

    void pause();
    void resume();

    [[nodiscard]]
    bool isRunning() const noexcept;

    [[nodiscard]]
    bool isPaused() const noexcept;

    // =============================================
    // Seeking
    // =============================================

    bool seek(double positionSeconds);

    // =============================================
    // Configuration
    // =============================================

    void setChunkSize(
        uint32_t frames);

    void setDecodeCallback(
        DecodeCallback callback);

    void setErrorCallback(
        ErrorCallback callback);

    void setEofCallback(
        EofCallback callback);

    // =============================================
    // Queries
    // =============================================

    [[nodiscard]]
    DecoderState getState() const;

    [[nodiscard]]
    double getPosition() const;

    [[nodiscard]]
    double getDuration() const;

    [[nodiscard]]
    AudioFormat getFormat() const;

private:
    void workerLoop();

private:
    std::unique_ptr<AudioDecoder>
        decoder_;

    std::thread workerThread_;

    std::atomic<bool>
        running_{false};

    std::atomic<bool>
        paused_{false};

    std::atomic<bool>
        stopRequested_{false};

    uint32_t chunkSize_ = 4096;

    std::string currentUri_;

    DecodeCallback decodeCallback_;
    ErrorCallback errorCallback_;
    EofCallback eofCallback_;

    mutable std::mutex mutex_;
    std::condition_variable pauseCv_;
};

} // namespace pristine::decoder 