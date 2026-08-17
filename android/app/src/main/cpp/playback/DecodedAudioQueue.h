#pragma once

#include <vector>
#include <queue>
#include <mutex>
#include <condition_variable>
#include <optional>

namespace pristine::playback {

// =====================================================
// PCM CHUNK
// =====================================================

struct PCMChunkHeader {

    uint32_t sampleRate = 48000;

    uint32_t channels = 2;

    uint32_t numFrames = 0;

    uint64_t framePosition = 0;

    bool isEndOfStream = false;

    bool isDiscontinuity = false;

    bool isSilence = false;
};

struct PCMChunk {

    PCMChunkHeader header;

    std::vector<float> samples;

    void clear() {
        header = {};
        samples.clear();
    }
};

// =====================================================
// DECODED AUDIO QUEUE
// =====================================================

class DecodedAudioQueue {
public:

    explicit DecodedAudioQueue(
        size_t maxChunks = 64
    );

    bool push(
        PCMChunk&& chunk
    );

    bool pop(
        PCMChunk& chunk
    );

    bool peek(
        PCMChunkHeader& header
    ) const;

    void clear();

    bool empty() const;

    size_t size() const;

private:

    size_t maxChunks_;

    mutable std::mutex mutex_;

    std::queue<PCMChunk> queue_;
};

}