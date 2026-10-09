#pragma once

#include <memory>
#include <atomic>
#include <chrono>
#include <mutex>
#include <string>
#include "PlaybackState.h"
#include "PlaybackMetrics.h"
#include "PlaybackClock.h"
#include "PCMQueue.h"
#include "PlaybackTypes.h"
#include "TrackQueue.h"
#include "../decoder/DecoderWorker.h"

namespace pristine::playback {

class PlaybackController {
public:
    PlaybackController();
    ~PlaybackController();

    PlaybackController(const PlaybackController&) = delete;
    PlaybackController& operator=(const PlaybackController&) = delete;

    // Lifecycle
    bool initialize();
    void shutdown();
    bool isInitialized() const noexcept;

    // Transport
    bool loadTrack(const TrackInfo& track);
    bool play();
    bool pause();
    bool stop();
    bool seek(double seconds);

    // Queue & Navigation
    bool next();
    bool previous();
    void setShuffle(bool enabled);
    void setRepeatMode(RepeatMode mode);
    std::shared_ptr<TrackQueue> queue() const noexcept;

    // Audio thread
    void render(float* output, uint32_t frames, uint32_t channels, uint32_t sampleRate) noexcept;

    // Laju stream yang SEDANG dipakai. Diisi oleh pemilik stream (AudioEngine
    // lewat AudioCallback) supaya decoder tahu target laju yang benar.
    //
    // Tanpa ini decoder memakai default 48000, sehingga file 96/192 kHz
    // diturunkan ke 48 kHz - kebalikan dari bit-perfect.
    void setStreamSampleRate(uint32_t rate) noexcept;
    uint32_t streamSampleRate() const noexcept;

    // 🔥 FIX (2026-10-07): laju FILE yang diminta, berbeda dari laju stream.
    //
    // Diisi otomatis oleh loadTrack(track.sampleRate), lalu dibaca
    // EngineManager untuk memilih laju stream lewat
    // DeviceRateDetector::pickBestRate(). Tanpa ini tidak ada jalur yang
    // membawa laju file ke pembukaan stream: stream selalu dibuka di laju
    // tertinggi perangkat, bukan laju file.
    //
    // 0 = laju file tidak diketahui (metadata tidak terbaca) -> engine
    // mendeteksi sendiri.
    //
    // ⚠️ Memilih laju stream yang BENAR saat start() belum menghasilkan
    // bit-perfect kalau stream dibuka sebelum track dimuat. Bit-perfect butuh
    // stream dibuka di laju track, jadi urutan panggilannya: loadTrack dulu,
    // baru start().
    void setFileSampleRate(uint32_t rate) noexcept;
    uint32_t currentFileSampleRate() const noexcept;

    // State accessors
    std::shared_ptr<PlaybackState> state() const noexcept;
    std::shared_ptr<MetricsCollector> metrics() const noexcept;
    std::shared_ptr<PlaybackClock> clock() const noexcept;
    std::shared_ptr<PCMQueue> pcmQueue() const noexcept;

    // true kalau decoder untuk sebuah track sudah terbuka.
    //
    // Dipakai getController() JNI untuk memuat track tepat SATU kali sebelum
    // engine start - memuat track itu me-reset posisi dan clock, jadi tidak
    // boleh dipanggil berulang tiap JNI call.
    bool hasDecoder() const noexcept;

private:
    bool startDecoder(const TrackInfo& track);
    void stopDecoder();

    // 🔥 Advance queue + loadTrack setelah EOF (dipanggil dari thread decoder).
    // Lihat implementasi: harus di thread terpisah supaya tidak self-join.
    void scheduleAdvance();
    void updatePlaybackState();

    std::atomic<bool> initialized_{false};
    std::atomic<bool> playing_{false};
    std::atomic<bool> stopping_{false};
    TrackInfo currentTrack_{};

    std::shared_ptr<PlaybackState> state_;
    std::shared_ptr<MetricsCollector> metrics_;
    std::shared_ptr<PlaybackClock> clock_;
    std::shared_ptr<PCMQueue> pcmQueue_;
    std::atomic<bool> clearing_{false};

    // Laju stream aktual (dari device/DAC). 0 = belum diketahui.
    std::atomic<uint32_t> streamSampleRate_{0};

    // Laju FILE yang diminta (metadata track). 0 = belum diketahui.
    // Terpisah dari streamSampleRate_ karena keduanya memang berbeda sampai
    // stream berhasil dibuka di laju file.
    std::atomic<uint32_t> fileSampleRate_{0};

    std::shared_ptr<TrackQueue> queue_;

    std::unique_ptr<decoder::DecoderWorker> decoderWorker_;

    // 🔥 FIX (2026-10-09, crash auto-advance): decoderWorker_ dibaca dari
    // audio thread (render()) dan ditulis ulang oleh advanceThread (loadTrack
    // → stopDecoder → reset + make_unique). Lock ini menyinkronkan keduanya.
    // recursive supaya aman jika loadTrack dipanggil dari thread yang sedang
    // memegang lock (mis. sync dari seek).
    std::recursive_mutex decoderMutex_;

    // 🔥 Thread untuk advance queue setelah EOF (lihat scheduleAdvance).
    std::thread advanceThread_;

    // 🔥 FIX (2026-10-06): anti-flood EOF. Lihat setEofCallback di
    // PlaybackController.cpp — trek korup/0-byte bikin decoder EOF berulang
    // dan menembak event ke JS ratusan kali per detik.
    //
    // ⚠️ JANGAN pakai std::atomic<std::string> — std::atomic hanya untuk
    // tipe trivially copyable, dan std::string bukan itu. NDK clang
    // menolak: "std::atomic<T> requires that 'T' be a trivially copyable
    // type" (build 37399429037, 01:47 UTC). Pakai mutex biasa.
    std::mutex eofMutex_;
    std::string lastEofUri_;
    std::chrono::steady_clock::time_point lastEofTime_;
};

} // namespace pristine::playback