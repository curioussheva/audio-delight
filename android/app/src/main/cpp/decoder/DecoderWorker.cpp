#include "DecoderWorker.h"

#include <chrono>

namespace pristine::decoder {

using namespace std::chrono;

// =====================================================
// CONSTRUCTOR / DESTRUCTOR
// =====================================================

DecoderWorker::DecoderWorker(std::unique_ptr<AudioDecoder> decoder)
    : decoder_(std::move(decoder)) {}

DecoderWorker::~DecoderWorker() {
    stop();
}

// =====================================================
// LIFECYCLE
// =====================================================

bool DecoderWorker::start(const std::string& uri, double startPosition) {
    if (running_.load()) return false;

    stopRequested_.store(false);
    paused_.store(false);
    currentUri_ = uri;

    if (!decoder_) {
        if (errorCallback_) errorCallback_("Decoder not set");
        return false;
    }

    if (!decoder_->open(uri)) {
        if (errorCallback_) errorCallback_("Failed to open decoder");
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

    stopRequested_.store(true);
    paused_.store(false);
    pauseCv_.notify_all();

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
    pauseCv_.notify_all();
}

bool DecoderWorker::isRunning() const noexcept {
    return running_.load();
}

bool DecoderWorker::isPaused() const noexcept {
    return paused_.load();
}

// =====================================================
// SEEK
// =====================================================

bool DecoderWorker::seek(double positionSeconds) {
    if (!decoder_) return false;

    std::lock_guard<std::mutex> lock(mutex_);

    bool ok = decoder_->seek(positionSeconds);
    if (!ok) {
        if (errorCallback_) errorCallback_("Seek failed");
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

void DecoderWorker::setDecodeCallback(DecodeCallback callback) {
    decodeCallback_ = std::move(callback);
}

void DecoderWorker::setErrorCallback(ErrorCallback callback) {
    errorCallback_ = std::move(callback);
}

void DecoderWorker::setEofCallback(EofCallback callback) {
    eofCallback_ = std::move(callback);
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
    return decoder_->getPositionSeconds();
}

double DecoderWorker::getDuration() const {
    if (!decoder_) return 0.0;
    return decoder_->getDurationSeconds();
}

AudioFormat DecoderWorker::getFormat() const {
    if (!decoder_) return AudioFormat{};
    return decoder_->getOutputFormat();
}

// =====================================================
// MAIN LOOP
// =====================================================

void DecoderWorker::workerLoop() {
    while (!stopRequested_.load()) {

        // PAUSE HANDLING
        if (paused_.load()) {
            std::unique_lock<std::mutex> lock(mutex_);
            pauseCv_.wait(lock, [&] {
                return !paused_.load() || stopRequested_.load();
            });
        }

        if (stopRequested_.load()) break;

        // DECODE
        auto result = decoder_->decode(chunkSize_);

        if (result.status == DecodeStatus::Success) {

            if (decodeCallback_) {
                decodeCallback_(std::move(result));
            }

        } else if (result.status == DecodeStatus::EndOfStream) {
            if (eofCallback_) eofCallback_();
            break;

        } else if (result.status == DecodeStatus::Error ||
                   result.status == DecodeStatus::FatalError) {
            if (errorCallback_) errorCallback_(result.errorMessage);
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

} // namespace pristine::decoder
