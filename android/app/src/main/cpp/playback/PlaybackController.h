#pragma once

#include <memory>
#include <atomic>

#include "PlaybackState.h"
#include "PlaybackMetrics.h"
#include "PlaybackClock.h"
#include "PCMQueue.h"
#include "PlaybackTypes.h"

#include "../decoder/DecoderWorker.h"

namespace pristine::playback {

class PlaybackController {
public:
    PlaybackController();
    ~PlaybackController();

    PlaybackController(const PlaybackController&) = delete;
    PlaybackController& operator=(const PlaybackController&) = delete;

    // =====================================================
    // LIFECYCLE
    // =====================================================

    bool initialize();
    void shutdown();

    bool isInitialized() const noexcept;

    // =====================================================
    // TRANSPORT (ASYNC SAFE ENTRYPOINTS)
    // =====================================================

    bool loadTrack(const TrackInfo& track);

    bool play();
    bool pause();
    bool stop();
    bool seek(double seconds);

    // =====================================================
    // AUDIO THREAD (REALTIME CRITICAL)
    // =====================================================

    void render(float* output,
                uint32_t frames,
                uint32_t channels,
                uint32_t sampleRate) noexcept;

    // =====================================================
    // STATE ACCESSORS (LOCK-FREE)
    // =====================================================

    std::shared_ptr<PlaybackState> state() const noexcept;
    std::shared_ptr<PlaybackMetrics> metrics() const noexcept;
    std::shared_ptr<PlaybackClock> clock() const noexcept;
    std::shared_ptr<PCMQueue> pcmQueue() const noexcept;

private:

    // =====================================================
    // INTERNAL CONTROL
    // =====================================================

    bool startDecoder(const TrackInfo& track);
    void stopDecoder();

    void updatePlaybackState();

private:

    // =====================================================
    // CORE STATE (ATOMIC FIRST)
    // =====================================================

    std::atomic<bool> initialized_{false};
    std::atomic<bool> playing_{false};
    std::atomic<bool> stopping_{false};

    TrackInfo currentTrack_{};

    // =====================================================
    // CORE COMPONENTS
    // =====================================================

    std::shared_ptr<PlaybackState> state_;
    std::shared_ptr<PlaybackMetrics> metrics_;
    std::shared_ptr<PlaybackClock> clock_;
    std::shared_ptr<PCMQueue> pcmQueue_;

    std::unique_ptr<decoder::DecoderWorker> decoderWorker_;
};

} // namespace pristine::playback 