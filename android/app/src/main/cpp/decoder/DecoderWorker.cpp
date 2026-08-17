#include "DecoderWorker.h"

#include <chrono>
#include <iostream>

namespace pristine::decoder {

using namespace std::chrono;

// =====================================================
// CONSTRUCTOR / DESTRUCTOR
// =====================================================

DecoderWorker::DecoderWorker(std::unique_ptr<IDecoder> decoder)
    : decoder_(std::move(decoder)) {}

DecoderWorker::~DecoderWorker() {
    stop();
}

// =====================================================
// LIFECYCLE
// =====================================================

bool DecoderWorker::start(const std::string& uri, double startPosition) {
    if (running_.load()) return false;

    shouldStop_.store(false);
    paused_.store(false);
    currentUri_ = uri;

    if (!decoder_) {
        notifyError("Decoder not set");
        return false;
    }

    if (!decoder_->open(uri)) {
        notifyError("Failed to open decoder");
        return false;
    }

    if (startPosition > 0.0) {
        decoder_->seek(startPosition);
    }

    running_.store(true);

    workerThread_ = std::thread(&DecoderWorker::workerLoop, this);
    return true;
}

void DecoderWorker::stop() {
    if (!running_.load()) return;

    shouldStop_.store(true);
    paused_.store(false);
    cv_.notify_all();

    if (workerThread_.joinable()) {
        workerThread_.join();
    }

    running_.store(false);

    if (decoder_) {
        decoder_->close();
    }
}

void DecoderWorker::pause() {
    paused_.store(true);
}

void DecoderWorker::resume() {
    paused_.store(false);
    cv_.notify_all();
}

// =====================================================
// SEEK
// =====================================================

bool DecoderWorker::seek(double positionSeconds) {
    if (!decoder_) return false;

    std::lock_guard<std::mutex> lock(mutex_);

    bool ok = decoder_->seek(positionSeconds);
    if (!ok) {
        notifyError("Seek failed");
        return false;
    }

    return true;
}

// =====================================================
// CONFIG
// =====================================================

void DecoderWorker::setChunkSize(uint32_t frames) {
    chunkSize_ = frames;
}

void DecoderWorker::setChunkCallback(ChunkCallback cb) {
    chunkCb_ = std::move(cb);
}

void DecoderWorker::setErrorCallback(ErrorCallback cb) {
    errorCb_ = std::move(cb);
}

void DecoderWorker::setEofCallback(EofCallback cb) {
    eofCb_ = std::move(cb);
}

// =====================================================
// QUERY
// =====================================================

DecoderState DecoderWorker::getState() const {
    if (!decoder_) return DecoderState::Idle;
    return decoder_->getState();
}

double DecoderWorker::getPosition() const {
    if (!decoder_) return 0.0;
    return decoder_->getCurrentPosition();
}

double DecoderWorker::getDuration() const {
    if (!decoder_) return 0.0;
    return decoder_->getDurationSeconds();
}

const AudioFormat& DecoderWorker::getFormat() const {
    static AudioFormat empty{};
    if (!decoder_) return empty;
    return decoder_->getOutputFormat();
}

// =====================================================
// MAIN LOOP
// =====================================================

void DecoderWorker::workerLoop() {
    while (!shouldStop_.load()) {

        // PAUSE HANDLING
        if (paused_.load()) {
            std::unique_lock<std::mutex> lock(mutex_);
            cv_.wait(lock, [&] {
                return !paused_.load() || shouldStop_.load();
            });
        }

        if (shouldStop_.load()) break;

        // DECODE
        auto result = decoder_->decode(chunkSize_);

        if (result.status == DecodeStatus::Success) {

            if (chunkCb_) {
                playback::PCMChunk chunk;

                chunk.header.sampleRate = decoder_->getOutputFormat().sampleRate;
                chunk.header.channels   = decoder_->getOutputFormat().channels;
                chunk.header.numFrames  = result.framesDecoded;
                chunk.header.framePosition = result.framePosition;
                chunk.header.payloadSize = result.samples.size() * sizeof(float);

                chunk.samples = std::move(result.samples);

                chunkCb_(std::move(chunk));
            }

        } else if (result.status == DecodeStatus::Eof) {
            notifyEof();
            break;

        } else if (result.status == DecodeStatus::Error) {
            notifyError(result.errorMessage);
            break;

        } else if (result.status == DecodeStatus::NeedMoreData) {
            // streaming case → small sleep to avoid busy loop
            std::this_thread::sleep_for(milliseconds(2));
        }

        // yield ringan biar CPU tidak full spike
        std::this_thread::yield();
    }

    running_.store(false);
}

// =====================================================
// NOTIFIERS
// =====================================================

void DecoderWorker::notifyChunk(playback::PCMChunk&& chunk) {
    if (chunkCb_) chunkCb_(std::move(chunk));
}

void DecoderWorker::notifyError(const std::string& error) {
    if (errorCb_) errorCb_(error);
}

void DecoderWorker::notifyEof() {
    if (eofCb_) eofCb_();
}

} // namespace pristine::decoder 