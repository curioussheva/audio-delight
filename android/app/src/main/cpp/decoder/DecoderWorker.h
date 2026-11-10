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
    bool isPaused() const noexcept;

    // =============================================
    // Seeking
    // =============================================

    bool seek(double positionSeconds);

    // =============================================
    // Configuration
    // =============================================

    // 🔥 DIPANGKAS (2026-11-10, dead-code playback): setChunkSize dihapus —
    // 0 pemakai (chunkSize_ hanya dibaca workerLoop dengan default 4096).
    void setDecodeCallback(
        DecodeCallback callback);

    void setErrorCallback(
        ErrorCallback callback);

    // 🔥 FIX (2026-11-10, P-M10): callback KHUSUS error decode (cabang
    // Error/FatalError workerLoop). Berbeda dari setErrorCallback: yang itu
    // juga dipanggil untuk error start ("Failed to open decoder") dan seek
    // ("Seek failed") — seek gagal TIDAK boleh men-skip track, jadi
    // controller butuh kanal terpisah yang hanya menyala untuk error
    // decode di tengah stream (file korup / format tak didukung / I/O).
    void setDecodeErrorCallback(
        ErrorCallback callback);

    void setEofCallback(
        EofCallback callback);

    // =============================================
    // Queries
    // =============================================

    // 🔥 DIPANGKAS (2026-11-10, dead-code playback): getState/getFormat
    // dihapus — 0 pemakai. getPosition/getDuration HIDUP (dipakai seek()
    // dan P-M8). currentUri_ dihapus — hanya ditulis start(), tidak pernah
    // dibaca (write-only).
    [[nodiscard]]
    double getPosition() const;

    [[nodiscard]]
    double getDuration() const;

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

    DecodeCallback decodeCallback_;
    ErrorCallback errorCallback_;
    // 🔥 FIX (2026-11-10, P-M10): hanya cabang Error/FatalError workerLoop
    // yang memanggil ini (lihat workerLoop). Dipisah dari errorCallback_
    // supaya error start/seek tidak ikut men-skip track.
    ErrorCallback decodeErrorCallback_;
    EofCallback eofCallback_;

    mutable std::mutex mutex_;
    // FIX (Prioritas 6): mutex REKURSIF terpisah, khusus melindungi
    // decode()/decodeCallback_()/seek(). Direkursif karena
    // decodeCallback_ (dipanggil dari DALAM lock ini, di workerLoop)
    // bisa memicu decoderWorker_->pause() lewat backpressure internal
    // -- dari THREAD YANG SAMA yang sedang memegang lock ini. mutex_
    // di atas TETAP dipakai apa adanya untuk pauseCv_ (tidak diubah).
    mutable std::recursive_mutex decodeMutex_;
    std::condition_variable pauseCv_;
};

} // namespace pristine::decoder 