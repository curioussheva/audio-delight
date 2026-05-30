#pragma once

#include <cstdint>

#include "AudioConstants.h"
#include "AudioMetrics.h"
#include "RingBuffer.h"

namespace pristine {

// =====================================================
// AUDIO BUFFER CONTROLLER
// High-level wrapper around lock-free ringbuffer
// =====================================================

class AudioBufferController {
public:

    AudioBufferController();

    // =============================================
    // WRITE INTERLEAVED PCM
    // input:
    // LRLRLR...
    // =============================================

    bool pushInterleaved(
        const float* data,
        uint32_t frames
    ) noexcept;

    // =============================================
    // READ -> DEINTERLEAVED
    // output:
    // left[]
    // right[]
    // =============================================

    uint32_t popStereo(
        float* left,
        float* right,
        uint32_t frames
    ) noexcept;

    // =============================================
    // STATE
    // =============================================

    void clear() noexcept;

    uint32_t availableFrames() const noexcept;

    uint32_t freeFrames() const noexcept;

    bool empty() const noexcept;

    // =============================================
    // METRICS
    // =============================================

    uint64_t underruns() const noexcept;

    uint64_t overruns() const noexcept;

    void resetMetrics() noexcept;

private:

    RingBuffer<float> mBuffer;

    std::atomic<uint64_t> mUnderruns{0};
    std::atomic<uint64_t> mOverruns{0};
};

} // namespace pristine