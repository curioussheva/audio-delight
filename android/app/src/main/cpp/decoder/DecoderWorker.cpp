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
    : decoder_(std::move(decoder)) {
    // 🔥 FIX (2026-10-06): ambil chunkFrames dari DecodeConfig decoder,
    // bukan hardcoded 4096. PlaybackController sudah hitung chunk yang benar
    // berdasarkan rasio downsample file (lihat startDecoder).
    if (decoder_) {
        chunkSize_ = decoder_->config().chunkFrames;
        if (chunkSize_ == 0) {
            chunkSize_ = 4096;
        }
    }
}

DecoderWorker::~DecoderWorker() {
    stop();
}

// =====================================================
// LIFECYCLE
// =====================================================

bool DecoderWorker::start(const std::string& uri, double startPosition) {
    // 🔥 FIX (2026-11-10, p-m19): jangan silent-fail — force stop+join
    // kalau masih running ATAU thread lama masih joinable. running_ saja
    // tidak cukup: workerLoop menyetel running_=false saat keluar (EOF /
    // error), tapi thread-nya tetap joinable sampai stop() dipanggil.
    // Menimpa std::thread yang masih joinable = std::terminate.
    // (Dalam praktik tiap track memakai worker baru, jadi ini pertahanan —
    // tapi terminate di audio thread adalah crash yang tidak boleh ada.)
    if (running_.load() || workerThread_.joinable()) {
        __android_log_print(ANDROID_LOG_WARN, "DecoderWorker",
                            "start(): already running — forcing stop() (uri=%s)",
                            uri.c_str());
        stop();
    }

    stopRequested_.store(false);
    paused_.store(false);
    // PB6-W2A: jeda backpressure ikut di-reset — worker baru tidak
    // boleh mewarisi flag dari siklus sebelumnya.
    backpressurePaused_.store(false);

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
    stopRequested_.store(true);
    paused_.store(false);
    // PB6-W2A: jeda backpressure ikut dibatalkan supaya workerLoop
    // yang sedang timed wait tidak memeriksa predikat basi lagi.
    backpressurePaused_.store(false);
    pauseCv_.notify_all();

    if (workerThread_.joinable()) {
        workerThread_.join();
    }

    running_.store(false);

    // 🔥 FIX (2026-11-12, DC2-M2): tutup decoder di bawah decodeMutex_.
    // Sebelumnya close() jalan tanpa lock, jadi seek() dari thread JNI
    // (av_seek_frame + avcodec_flush_buffers di bawah decodeMutex_) bisa
    // beradu dengan close() dari loadTrack()/advance thread
    // (avcodec_free_context + avformat_close_input) -> UAF di FFmpeg.
    // Join TETAP di atas lock (urutan lama dipertahankan): worker thread
    // sudah mati saat lock diambil, jadi satu-satunya penantang lock di
    // sini adalah seek()/pause() — keduanya singkat dan tidak pernah
    // join — tidak ada join-while-holding dan tidak ada inversi urutan
    // lock. close() sendiri idempotent (AudioDecoder::close early-return
    // bila !isOpen_), jadi stop() ganda via destructor tetap aman.
    if (decoder_) {
        std::lock_guard<std::recursive_mutex> lock(decodeMutex_);
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
    // PB6-W2A: resume eksplisit melepas KEDUA jeda — pemanggil
    // (play()/seek()) sudah memastikan kondisi aman untuk lanjut.
    backpressurePaused_.store(false);
    pauseCv_.notify_all();
}

void DecoderWorker::pauseForBackpressure() {
    // PB6-W2A: HANYA set flag — tanpa ambil decodeMutex_, tanpa notify.
    // Dipanggil dari decodeCallback_ yang SUDAH berjalan di bawah
    // decodeMutex_ (workerLoop); mengambil lock itu lagi dari thread
    // yang sama hanya menambah hitungan rekursif tanpa menunggu apa
    // pun, dan tidak ada chunk aktif lain yang perlu ditunggu — callback
    // ini ADALAH chunk aktif itu. workerLoop memeriksa flag ini di
    // iterasi berikutnya dan masuk timed wait sendiri; notify tidak
    // diperlukan karena tidak ada yang sedang menunggu.
    backpressurePaused_.store(true);
}

void DecoderWorker::setAutoResumeCheck(AutoResumeCheck check) {
    autoResumeCheck_ = std::move(check);
}

bool DecoderWorker::isPaused() const noexcept {
    // PB6-W2A: kedua jenis jeda terhitung "paused" bagi pemanggil
    // (decode callback mengecek ini sebelum men-set backpressure).
    return paused_.load() || backpressurePaused_.load();
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

void DecoderWorker::setDecodeCallback(DecodeCallback callback) {
    decodeCallback_ = std::move(callback);
}

void DecoderWorker::setErrorCallback(ErrorCallback callback) {
    errorCallback_ = std::move(callback);
}

void DecoderWorker::setDecodeErrorCallback(ErrorCallback callback) {
    decodeErrorCallback_ = std::move(callback);
}

void DecoderWorker::setEofCallback(EofCallback callback) {
    eofCallback_ = std::move(callback);
}

// =====================================================
// QUERY
// =====================================================

double DecoderWorker::getPosition() const {
    if (!decoder_) return 0.0;
    return decoder_->getPositionSeconds();
}

double DecoderWorker::getDuration() const {
    if (!decoder_) return 0.0;
    return decoder_->getDurationSeconds();
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

        // PAUSE HANDLING (PB6-W2A, 2026-11-12)
        //
        // Dua jenis jeda, DUA flag — JANGAN disamakan:
        //
        //  * Pause EKSPLISIT (paused_): user menekan pause, atau seek()
        //    sedang memindahkan posisi. Hanya resume() eksplisit dari
        //    controller yang boleh melepasnya — wait TANPA batas di CV.
        //  * Pause BACKPRESSURE (backpressurePaused_): decode callback
        //    menjeda karena queue > 90% penuh. Yang ini BOLEH dilepas
        //    sendiri oleh thread decoder: timed wait 10 ms (≈ satu
        //    periode callback audio), lalu tanya autoResumeCheck_ —
        //    predikat dari controller yang memeriksa level queue +
        //    playing_ + fade-out pause. Audio thread tidak lagi
        //    menyentuh worker sama sekali (tidak ada snapshotWorker()
        //    + resume() per callback di render()).
        //
        // Timed wait 10 ms, bukan spin: worker yang kehabisan
        // backpressure tetap tidur di CV dan hanya bangun 100x/detik
        // untuk satu cek atomik — jauh di bawah biaya satu chunk
        // decode. resume()/stop() tetap membangunkan lewat notify_all.
        // Tanpa predikat (tidak di-set controller), worker tetap
        // tertidur sampai resume() eksplisit — perilaku lama, aman.
        while (paused_.load() || backpressurePaused_.load()) {
            if (stopRequested_.load()) break;
            std::unique_lock<std::mutex> lock(mutex_);
            if (paused_.load()) {
                // Eksplisit: tunggu tanpa batas sampai resume()/stop().
                pauseCv_.wait(lock, [&] {
                    return !paused_.load() || stopRequested_.load();
                });
            } else {
                // Backpressure saja: bangun tiap 10 ms untuk cek level.
                pauseCv_.wait_for(lock, std::chrono::milliseconds(10), [&] {
                    return !backpressurePaused_.load() ||
                           stopRequested_.load();
                });
                // Self-resume HANYA dari cabang backpressure, dan HANYA
                // bila predikat mengizinkan. Cek ulang paused_ di sini:
                // pause() eksplisit bisa mendarat selama timed wait
                // (tanpa notify — jeda eksplisit tidak boleh dilepas
                // predikat level).
                if (!paused_.load() &&
                    backpressurePaused_.load() &&
                    !stopRequested_.load() &&
                    autoResumeCheck_ && autoResumeCheck_()) {
                    backpressurePaused_.store(false);
                }
            }
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
                // 🔥 FIX (2026-11-10, P-M10): kanal khusus error decode —
                // controller memakai ini untuk men-skip ke track berikutnya.
                // errorCallback_ umum TIDAK dipakai untuk skip (juga menyala
                // untuk error start/seek).
                if (decodeErrorCallback_) {
                    decodeErrorCallback_(result.errorMessage);
                }
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
