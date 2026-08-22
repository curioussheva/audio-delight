#include "TrackQueue.h"

#include <algorithm>

namespace pristine::playback {

TrackQueue::TrackQueue()
    :
    mRandom(
        std::random_device{}()
    ) {
}

// =====================================
// Queue Management
// =====================================

void TrackQueue::setTracks(
    const std::vector<TrackInfo>& tracks
) {
    std::lock_guard lock(mMutex);

    mTracks = tracks;

    mCurrentIndex = 0;

    rebuildShuffle();
}

void TrackQueue::appendTrack(
    const TrackInfo& track
) {
    std::lock_guard lock(mMutex);

    mTracks.push_back(track);

    rebuildShuffle();
}

void TrackQueue::insertTrack(
    size_t index,
    const TrackInfo& track
) {
    std::lock_guard lock(mMutex);

    if (index > mTracks.size()) {
        index = mTracks.size();
    }

    mTracks.insert(
        mTracks.begin() + index,
        track
    );

    rebuildShuffle();
}

void TrackQueue::removeTrack(
    size_t index
) {
    std::lock_guard lock(mMutex);

    if (index >= mTracks.size()) {
        return;
    }

    mTracks.erase(
        mTracks.begin() + index
    );

    if (
        mCurrentIndex >= mTracks.size() &&
        !mTracks.empty()
    ) {
        mCurrentIndex =
            mTracks.size() - 1;
    }

    rebuildShuffle();
}

void TrackQueue::clear() {

    std::lock_guard lock(mMutex);

    mTracks.clear();

    mShuffleOrder.clear();

    mCurrentIndex = 0;
}

std::vector<TrackInfo> TrackQueue::tracks() const {
    std::lock_guard lock(mMutex);

    return mTracks;
}

// =====================================
// Navigation
// =====================================

std::optional<TrackInfo>
TrackQueue::current() const {

    std::lock_guard lock(mMutex);

    if (mTracks.empty()) {
        return std::nullopt;
    }

    const auto& queue =
        activeQueue();

    return queue[mCurrentIndex];
}

std::optional<TrackInfo>
TrackQueue::next() const {

    std::lock_guard lock(mMutex);

    if (!hasNext()) {
        return std::nullopt;
    }

    const auto& queue =
        activeQueue();

    return queue[mCurrentIndex + 1];
}

std::optional<TrackInfo>
TrackQueue::previous() const {

    std::lock_guard lock(mMutex);

    if (!hasPrevious()) {
        return std::nullopt;
    }

    const auto& queue =
        activeQueue();

    return queue[mCurrentIndex - 1];
}

std::optional<TrackInfo>
TrackQueue::peek(
    size_t offset
) const {

    std::lock_guard lock(mMutex);

    if (mTracks.empty()) {
        return std::nullopt;
    }

    const size_t target =
        mCurrentIndex + offset;

    const auto& queue =
        activeQueue();

    if (target >= queue.size()) {
        return std::nullopt;
    }

    return queue[target];
}

bool TrackQueue::advance() {

    std::lock_guard lock(mMutex);

    if (mTracks.empty()) {
        return false;
    }

    switch (mRepeatMode) {

    case RepeatMode::One:
        return true;

    case RepeatMode::All:

        if (
            mCurrentIndex + 1 >=
            activeQueue().size()
        ) {
            mCurrentIndex = 0;
            return true;
        }

        ++mCurrentIndex;
        return true;

    case RepeatMode::Off:

        if (
            mCurrentIndex + 1 >=
            activeQueue().size()
        ) {
            return false;
        }

        ++mCurrentIndex;
        return true;
    }

    return false;
}

bool TrackQueue::retreat() {

    std::lock_guard lock(mMutex);

    if (
        mTracks.empty() ||
        mCurrentIndex == 0
    ) {
        return false;
    }

    --mCurrentIndex;

    return true;
}

bool TrackQueue::jumpTo(
    size_t index
) {
    std::lock_guard lock(mMutex);

    if (
        index >= activeQueue().size()
    ) {
        return false;
    }

    mCurrentIndex = index;

    return true;
}

// =====================================
// Modes
// =====================================

void TrackQueue::setShuffleMode(
    ShuffleMode mode
) {
    std::lock_guard lock(mMutex);

    if (
        mShuffleMode == mode
    ) {
        return;
    }

    mShuffleMode = mode;

    rebuildShuffle();
}

ShuffleMode
TrackQueue::getShuffleMode() const {

    return mShuffleMode;
}

void TrackQueue::setRepeatMode(
    RepeatMode mode
) {
    mRepeatMode = mode;
}

RepeatMode
TrackQueue::getRepeatMode() const {

    return mRepeatMode;
}

// =====================================
// Queries
// =====================================

bool TrackQueue::isEmpty() const {

    std::lock_guard lock(mMutex);

    return mTracks.empty();
}

bool TrackQueue::hasNext() const {

    if (mTracks.empty()) {
        return false;
    }

    return (
        mCurrentIndex + 1 <
        activeQueue().size()
    );
}

bool TrackQueue::hasPrevious() const {

    return mCurrentIndex > 0;
}

size_t
TrackQueue::size() const {

    std::lock_guard lock(mMutex);

    return mTracks.size();
}

size_t
TrackQueue::currentIndex() const {

    return mCurrentIndex;
}

// =====================================
// Internal
// =====================================

const std::vector<TrackInfo>&
TrackQueue::activeQueue() const {

    if (
        mShuffleMode ==
        ShuffleMode::Off
    ) {
        return mTracks;
    }

    static thread_local
    std::vector<TrackInfo> shuffled;

    shuffled.clear();

    for (
        auto index :
        mShuffleOrder
    ) {
        shuffled.push_back(
            mTracks[index]
        );
    }

    return shuffled;
}

void TrackQueue::rebuildShuffle() {

    mShuffleOrder.clear();

    mShuffleOrder.reserve(
        mTracks.size()
    );

    for (
        size_t i = 0;
        i < mTracks.size();
        ++i
    ) {
        mShuffleOrder.push_back(i);
    }

    std::shuffle(
        mShuffleOrder.begin(),
        mShuffleOrder.end(),
        mRandom
    );
}

} // namespace pristine::playback 