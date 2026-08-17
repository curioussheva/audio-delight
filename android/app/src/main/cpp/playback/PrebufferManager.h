#pragma once

#include "PlaybackTypes.h"

#include "../decoder/AudioDecoder.h"

#include <atomic>
#include <functional>
#include <memory>
#include <mutex>
#include <thread>
#include <vector>

namespace pristine::playback {

// =====================================================
// PREBUFFER STATE
// =====================================================

enum class PrebufferState {
    Idle,
    Running,
    Ready,
    Error,
    Cancelled
};

// =====================================================
// PREBUFFERED TRACK
// =====================================================

struct PrebufferedTrack {

    TrackInfo track;

    std::vector<float> pcmData;

    uint32_t sampleRate = 48000;

    uint32_t channels = 2;

    uint64_t totalFrames = 0;

    bool complete = false;

    std::string error;
};

// =====================================================
// PREBUFFER MANAGER
// =====================================================

class PrebufferManager {
public:

    using DecoderFactory =
        std::function<
            std::unique_ptr<
                decoder::AudioDecoder
            >()
        >;

    explicit PrebufferManager(
        DecoderFactory factory
    );

    ~PrebufferManager();

    void startPrebuffer(
        const TrackInfo& track,
        uint64_t maxFrames
    );

    void cancel();

    [[nodiscard]]
    PrebufferState state() const noexcept;

    [[nodiscard]]
    bool isReady() const noexcept;

    [[nodiscard]]
    float progress() const noexcept;

    [[nodiscard]]
    std::unique_ptr<
        PrebufferedTrack
    > takePrebuffer();

private:

    void decodeLoop(
        TrackInfo track,
        uint64_t maxFrames
    );

private:

    DecoderFactory decoderFactory_;

    std::atomic<PrebufferState>
        state_{
            PrebufferState::Idle
        };

    std::atomic<bool>
        cancelRequested_{false};

    std::atomic<uint64_t>
        decodedFrames_{0};

    std::atomic<uint64_t>
        targetFrames_{0};

    std::mutex mutex_;

    std::unique_ptr<
        PrebufferedTrack
    > prebufferedTrack_;

    std::thread worker_;
};

} // namespace pristine::playback