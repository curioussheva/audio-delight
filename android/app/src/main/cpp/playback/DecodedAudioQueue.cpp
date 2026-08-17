#include "DecodedAudioQueue.h"

namespace pristine::playback {

DecodedAudioQueue::DecodedAudioQueue(
    size_t maxChunks
)
    :
    maxChunks_(maxChunks) {
}

bool DecodedAudioQueue::push(
    PCMChunk&& chunk
) {

    std::lock_guard lock(
        mutex_
    );

    if (
        queue_.size() >=
        maxChunks_
    ) {
        return false;
    }

    queue_.push(
        std::move(chunk)
    );

    return true;
}

bool DecodedAudioQueue::pop(
    PCMChunk& chunk
) {

    std::lock_guard lock(
        mutex_
    );

    if (
        queue_.empty()
    ) {
        return false;
    }

    chunk =
        std::move(
            queue_.front()
        );

    queue_.pop();

    return true;
}

bool DecodedAudioQueue::peek(
    PCMChunkHeader& header
) const {

    std::lock_guard lock(
        mutex_
    );

    if (
        queue_.empty()
    ) {
        return false;
    }

    header =
        queue_.front().header;

    return true;
}

void DecodedAudioQueue::clear() {

    std::lock_guard lock(
        mutex_
    );

    while (
        !queue_.empty()
    ) {
        queue_.pop();
    }
}

bool DecodedAudioQueue::empty() const {

    std::lock_guard lock(
        mutex_
    );

    return queue_.empty();
}

size_t DecodedAudioQueue::size() const {

    std::lock_guard lock(
        mutex_
    );

    return queue_.size();
}

}