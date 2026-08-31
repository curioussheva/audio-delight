#pragma once

#include <memory>
#include <atomic>
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

    // State accessors
    std::shared_ptr<PlaybackState> state() const noexcept;
    std::shared_ptr<MetricsCollector> metrics() const noexcept;
    std::shared_ptr<PlaybackClock> clock() const noexcept;
    std::shared_ptr<PCMQueue> pcmQueue() const noexcept;

private:
    bool startDecoder(const TrackInfo& track);
    void stopDecoder();
    void updatePlaybackState();

    std::atomic<bool> initialized_{false};
    std::atomic<bool> playing_{false};
    std::atomic<bool> stopping_{false};
    TrackInfo currentTrack_{};

    std::shared_ptr<PlaybackState> state_;
    std::shared_ptr<MetricsCollector> metrics_;
    std::shared_ptr<PlaybackClock> clock_;
    std::shared_ptr<PCMQueue> pcmQueue_;
    std::shared_ptr<TrackQueue> queue_;

    std::unique_ptr<decoder::DecoderWorker> decoderWorker_;
};

} // namespace pristine::playback