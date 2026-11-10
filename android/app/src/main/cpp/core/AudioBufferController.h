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

    bool empty() const noexcept;

    // (freeFrames()/underruns()/overruns()/resetMetrics() dihapus 2026-11-10:
    // 0 caller.)

private:

    RingBuffer<float> mBuffer;
};

} // namespace pristine