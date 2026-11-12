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

    // PB6-W2A (2026-11-12): pause KHUSUS backpressure (queue penuh).
    //
    // BERBEDA dari pause() eksplisit — dua flag terpisah, JANGAN
    // disamakan (lihat backpressurePaused_ di bawah): jeda ini BOLEH
    // dilepas sendiri oleh thread decoder saat level queue turun
    // (timed wait + autoResumeCheck_), sementara pause() eksplisit
    // (user pause / seek) HANYA boleh dilepas resume() dari controller.
    // Dulu keduanya berbagi paused_ dan render() (audio thread) yang
    // me-resume tiap callback — resume itu menghidupkan lagi audio
    // yang baru dijeda user (bug 2026-10-10) dan bisa mendahului
    // clear() saat seek.
    //
    // Hanya set flag atomik — tanpa ambil decodeMutex_: dipanggil dari
    // decodeCallback_ yang SUDAH berjalan di bawah lock itu (workerLoop),
    // jadi tidak ada chunk aktif lain yang perlu ditunggu.
    void pauseForBackpressure();

    // PB6-W2A: predikat auto-resume untuk jeda backpressure.
    //
    // Dipanggil workerLoop dari thread decoder, HANYA saat
    // backpressure-paused (tidak pernah untuk jeda eksplisit).
    // Diset sekali sebelum start() (happens-before lewat pembuatan
    // thread worker); tanpa predikat, worker tetap tertidur sampai
    // resume() eksplisit — perilaku lama, aman.
    using AutoResumeCheck = std::function<bool()>;
    void setAutoResumeCheck(AutoResumeCheck check);

    [[nodiscard]]
    bool isPaused() const noexcept;

    // PB6-W5 (2026-11-12): baca saja dua flag batal — dipakai decode
    // callback (PlaybackController) untuk wait-for-space sebelum write.
    // isPaused() TIDAK cukup di sini: ia menggabung paused_ eksplisit
    // dengan backpressurePaused_, sementara wait harus batal HANYA
    // untuk jeda eksplisit / stop. (Selama callback berjalan,
    // backpressurePaused_ praktis false — flag itu baru diset callback
    // yang sama SESUDAH write — tapi mengandalkannya rapuh.)
    [[nodiscard]]
    bool isExplicitlyPaused() const noexcept;

    [[nodiscard]]
    bool isStopRequested() const noexcept;

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
    // dulu bisa memicu decoderWorker_->pause() lewat backpressure
    // internal -- dari THREAD YANG SAMA yang sedang memegang lock ini.
    // Sejak PB6-W2A backpressure memakai pauseForBackpressure() yang
    // TIDAK mengambil lock ini (hanya set flag atomik); pause()
    // eksplisit tetap rekursif karena dipanggil dari thread lain
    // (seek()/pause() controller) sambil menunggu chunk aktif selesai.
    // mutex_ di atas TETAP dipakai apa adanya untuk pauseCv_ (tidak diubah).
    mutable std::recursive_mutex decodeMutex_;
    std::condition_variable pauseCv_;

    // PB6-W2A (2026-11-12): jeda backpressure, TERPISAH dari paused_.
    //
    // paused_ = jeda EKSPLISIT (user pause / seek): hanya resume()
    // yang boleh melepas. backpressurePaused_ = jeda karena queue
    // > 90% penuh (diset decode callback via pauseForBackpressure()):
    // workerLoop BOLEH melepasnya sendiri saat autoResumeCheck_
    // mengizinkan (queue < 60% + playing_ + bukan fade-out pause).
    // Satu flag untuk keduanya pernah membuat resume berbasis level
    // menghidupkan lagi audio yang dijeda user (bug 2026-10-10) dan
    // me-resume di tengah seek (queue habis di-clear = avail 0).
    std::atomic<bool> backpressurePaused_{false};

    // B8-P1 (2026-11-12): EOF-idle — worker tetap hidup sesudah
    // EndOfStream, bukan keluar loop. Tanpa ini, seek()/play() sesudah
    // EOF tidak bisa revive worker (thread mati; resume() no-op).
    // Di-set workerLoop saat EndOfStream (SEBELUM eofCallback_, supaya
    // seek() yang mendarat selama callback bisa clear flag ini),
    // di-clear DecoderWorker::seek() (sesudah decoder_->seek() berhasil)
    // dan start() (track baru). workerLoop tidur di pauseCv_ selama
    // flag ini true; resume() saja TIDAK melepasnya.
    std::atomic<bool> eof_{false};

    // PB6-W2A: predikat auto-resume (lihat setAutoResumeCheck).
    // Ditulis sekali sebelum start(), hanya dibaca workerLoop saat
    // backpressure-paused.
    AutoResumeCheck autoResumeCheck_;
};

} // namespace pristine::decoder 