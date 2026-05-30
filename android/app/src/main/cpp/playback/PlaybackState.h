// =====================================================
// playback/PlaybackState.h
// =====================================================

#pragma once

#include <atomic>
#include <cstdint>
#include <mutex>
#include <string>

namespace pristine {

// =====================================================
// PLAYBACK STATUS
// =====================================================

enum class PlaybackStatus : uint8_t {

    Stopped = 0,
    Loading,
    Playing,
    Paused,
    Buffering,
    Completed,
    Error
};

// =====================================================
// TRACK METADATA
// =====================================================

struct TrackMetadata {

    std::string uri;
    std::string title;
    std::string artist;
    std::string album;

    uint64_t durationMs = 0;
};

// =====================================================
// PLAYBACK STATE
// =====================================================

class PlaybackState {
public:

    // =============================================
    // STATUS
    // =============================================

    inline void setStatus(
        PlaybackStatus status
    ) noexcept {

        mStatus.store(
            status,
            std::memory_order_release
        );
    }

    inline PlaybackStatus
    getStatus() const noexcept {

        return mStatus.load(
            std::memory_order_acquire
        );
    }

    // =============================================
    // POSITION
    // =============================================

    inline void setPositionSamples(
        uint64_t samples
    ) noexcept {

        mPositionSamples.store(
            samples,
            std::memory_order_release
        );
    }

    inline uint64_t
    getPositionSamples() const noexcept {

        return mPositionSamples.load(
            std::memory_order_acquire
        );
    }

    inline uint64_t
    getPositionMs(
        uint32_t sampleRate
    ) const noexcept {

        if (sampleRate == 0) {
            return 0;
        }

        return
            (
                getPositionSamples()
                * 1000ULL
            ) / sampleRate;
    }

    // =============================================
    // METADATA
    // =============================================

    void setMetadata(
        const TrackMetadata& meta
    ) {

        std::lock_guard<std::mutex>
            lock(mMutex);

        mMetadata = meta;
    }

    TrackMetadata
    getMetadata() const {

        std::lock_guard<std::mutex>
            lock(mMutex);

        return mMetadata;
    }

    // =============================================
    // ERROR
    // =============================================

    void setError(
        const std::string& error
    ) {

        std::lock_guard<std::mutex>
            lock(mMutex);

        mError = error;
    }

    std::string
    getError() const {

        std::lock_guard<std::mutex>
            lock(mMutex);

        return mError;
    }

    // =============================================
    // RESET
    // =============================================

    void reset() {

        setStatus(
            PlaybackStatus::Stopped
        );

        setPositionSamples(0);

        std::lock_guard<std::mutex>
            lock(mMutex);

        mMetadata = {};
        mError.clear();
    }

private:

    mutable std::mutex mMutex;

    std::atomic<PlaybackStatus>
        mStatus{
            PlaybackStatus::Stopped
        };

    std::atomic<uint64_t>
        mPositionSamples{0};

    TrackMetadata mMetadata;

    std::string mError;
};

} // namespace pristine 