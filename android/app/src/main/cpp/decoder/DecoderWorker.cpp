#include <android/log.h>
#include "DecoderWorker.h"

#include <chrono>
#include <cerrno>
#include <cstring>
#include <sys/resource.h>
#include <pthread.h>
#include <unistd.h>

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
    // 🩹 FIX (Prioritas 4): pause() sebelumnya cuma set flag lalu
    // LANGSUNG return — tidak menunggu apa pun. Kalau caller (mis.
    // PlaybackController::seek()) lanjut pcmQueue_->clear() sesaat
    // setelah ini, decode+callback yang masih di tengah jalan bisa
    // tetap write() ke queue yang baru saja di-reset -> desync.
    // Ambil mutex_ yang sama dipakai workerLoop() supaya pause()
    // benar-benar menunggu iterasi decode+callback aktif selesai
    // dulu sebelum return ke caller.
    //
    // FIX (Prioritas 6): decodeMutex_ REKURSIF, bukan mutex_ lagi --
    // kalau pause() ini dipanggil dari THREAD YANG SAMA yang sedang
    // memegang decodeMutex_ (kasus backpressure dari decodeCallback_),
    // recursive_mutex mengizinkan masuk ulang tanpa deadlock, karena
    // memang tidak ada yang perlu ditunggu dari thread itu sendiri.
    std::lock_guard<std::recursive_mutex> lock(decodeMutex_);
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

    // FIX (Prioritas 6): decodeMutex_ (rekursif), bukan mutex_ lagi
    std::lock_guard<std::recursive_mutex> lock(decodeMutex_);

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
    // 🔥 FIX: Set thread priority ke AUDIO (-16) 
    // Default = 0 (NORMAL). Decoder harus LEBIH TINGGI dari normal
    // untuk mencegah starvation oleh audio callback thread.
    {
        // Prioritas audio untuk decoder (jangan URGENT karena hanya callback Oboe)
        int priority = -16;  // ANDROID_PRIORITY_AUDIO
        pid_t tid = gettid();
        if (setpriority(PRIO_PROCESS, tid, priority) != 0) {
            __android_log_print(ANDROID_LOG_WARN, "DecoderWorker",
                "setpriority(%d) failed: %s", priority, strerror(errno));
        } else {
            __android_log_print(ANDROID_LOG_INFO, "DecoderWorker",
                "Thread priority set to %d (AUDIO)", priority);
        }
        
    }
    
    __android_log_print(ANDROID_LOG_INFO, "DecoderWorker",
        "workerLoop started");
    
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
        // 🩹 FIX (Prioritas 4): lock diperluas mencakup decodeCallback_()
        // (yang memanggil pcmQueue_->write()). Sebelumnya callback ini
        // dipanggil DI LUAR lock — artinya seek()/pause() bisa lanjut
        // pcmQueue_->clear() di tengah write() sedang berjalan, walau
        // decode() sendiri sudah selesai & lock sudah dilepas duluan.
        // Sekarang decode() + callback jadi SATU critical section utuh.
        {
            // FIX (Prioritas 6): decodeMutex_ (rekursif), bukan mutex_ lagi
            std::lock_guard<std::recursive_mutex> lock(decodeMutex_);

            auto result = decoder_->decode(chunkSize_);

            // 🔥 DEBUG: log tiap 100 loop untuk trace
            static int loopCount = 0;
            loopCount++;
            if (loopCount % 100 == 0) {
                __android_log_print(ANDROID_LOG_INFO, "DecoderWorker",
                    "loop #%d: status=%d, frames=%u",
                    loopCount, (int)result.status, result.framesDecoded);
            }

            if (result.status == DecodeStatus::Success) {

                if (decodeCallback_) {
                    decodeCallback_(std::move(result));
                }

            } else if (result.status == DecodeStatus::EndOfStream) {
                __android_log_print(ANDROID_LOG_WARN, "DecoderWorker",
                    "EOF reached, exiting loop");
                if (eofCallback_) eofCallback_();
                break;

            } else if (result.status == DecodeStatus::Error ||
                       result.status == DecodeStatus::FatalError) {
                __android_log_print(ANDROID_LOG_ERROR, "DecoderWorker",
                    "Error: %s", result.errorMessage.c_str());
                if (errorCallback_) errorCallback_(result.errorMessage);
                break;

            } else if (result.status == DecodeStatus::NeedMoreData) {
                // streaming case → small sleep to avoid busy loop
                std::this_thread::sleep_for(milliseconds(2));
            }
        }

        // 🔥 FIX: micro-sleep 100us, jangan full yield
        std::this_thread::sleep_for(std::chrono::microseconds(50));
    }

    __android_log_print(ANDROID_LOG_INFO, "DecoderWorker",
        "workerLoop EXITED");
    running_.store(false);
}

} // namespace pristine::decoder
