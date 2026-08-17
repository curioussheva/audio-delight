#pragma once

#include "PlaybackTypes.h"

#include <vector>
#include <optional>
#include <mutex>
#include <random>

namespace pristine::playback {

class TrackQueue {
public:

    TrackQueue();

    ~TrackQueue() = default;

    TrackQueue(
        const TrackQueue&
    ) = delete;

    TrackQueue& operator=(
        const TrackQueue&
    ) = delete;

    // =====================================
    // Queue Management
    // =====================================

    void setTracks(
        const std::vector<TrackInfo>& tracks
    );

    void appendTrack(
        const TrackInfo& track
    );

    void insertTrack(
        size_t index,
        const TrackInfo& track
    );

    void removeTrack(
        size_t index
    );

    void clear();

    // =====================================
    // Navigation
    // =====================================

    [[nodiscard]]
    std::optional<TrackInfo>
    current() const;

    [[nodiscard]]
    std::optional<TrackInfo>
    next() const;

    [[nodiscard]]
    std::optional<TrackInfo>
    previous() const;

    [[nodiscard]]
    std::optional<TrackInfo>
    peek(size_t offset) const;

    bool advance();

    bool retreat();

    bool jumpTo(
        size_t index
    );

    // =====================================
    // Modes
    // =====================================

    void setShuffleMode(
        ShuffleMode mode
    );

    [[nodiscard]]
    ShuffleMode
    getShuffleMode() const;

    void setRepeatMode(
        RepeatMode mode
    );

    [[nodiscard]]
    RepeatMode
    getRepeatMode() const;

    // =====================================
    // Queries
    // =====================================

    [[nodiscard]]
    bool isEmpty() const;

    [[nodiscard]]
    bool hasNext() const;

    [[nodiscard]]
    bool hasPrevious() const;

    [[nodiscard]]
    size_t size() const;

    [[nodiscard]]
    size_t currentIndex() const;

private:

    [[nodiscard]]
    const std::vector<TrackInfo>&
    activeQueue() const;

    void rebuildShuffle();

private:

    mutable std::mutex mMutex;

    // canonical playlist

    std::vector<TrackInfo>
        mTracks;

    // shuffled playback order

    std::vector<size_t>
        mShuffleOrder;

    size_t
        mCurrentIndex = 0;

    ShuffleMode
        mShuffleMode =
            ShuffleMode::Off;

    RepeatMode
        mRepeatMode =
            RepeatMode::Off;

    std::mt19937
        mRandom;
};

} // namespace pristine::playback 