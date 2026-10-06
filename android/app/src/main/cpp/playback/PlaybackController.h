#pragma once

#include <memory>
#include <atomic>
#include <chrono>
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

    // State accessors
    std::shared_ptr<PlaybackState> state() const noexcept;
    std::shared_ptr<MetricsCollector> metrics() const noexcept;
    std::shared_ptr<PlaybackClock> clock() const noexcept;
    std::shared_ptr<PCMQueue> pcmQueue() const noexcept;

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
    std::shared_ptr<TrackQueue> queue_;

    std::unique_ptr<decoder::DecoderWorker> decoderWorker_;

    // 🔥 Thread untuk advance queue setelah EOF (lihat scheduleAdvance).
    std::thread advanceThread_;

    // 🔥 FIX (2026-10-06): anti-flood EOF. Lihat setEofCallback di
    // PlaybackController.cpp — trek korup/0-byte bikin decoder EOF berulang
    // dan menembak event ke JS ratusan kali per detik.
    std::atomic<std::string> lastEofUri_;
    std::atomic<std::chrono::steady_clock::time_point> lastEofTime_;
};

} // namespace pristine::playback