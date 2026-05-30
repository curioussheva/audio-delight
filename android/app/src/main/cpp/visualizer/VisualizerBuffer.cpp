// =====================================================
// visualizer/VisualizerBuffer.cpp
// =====================================================

#include "VisualizerBuffer.h"

namespace pristine {

// =====================================================
// CONSTRUCTOR
// =====================================================

VisualizerBuffer::VisualizerBuffer() {

    memset(mBufferA, 0, sizeof(mBufferA));
    memset(mBufferB, 0, sizeof(mBufferB));
}

// =====================================================
// WRITE (audio thread)
// =====================================================

void VisualizerBuffer::write(
    const float* left,
    const float* right,
    int32_t frames
) {

    const int writeBuffer =
        mWriteBuffer.load(
            std::memory_order_relaxed
        );

    float* dst =
        writeBuffer == 0
        ? mBufferA
        : mBufferB;

    uint32_t pos =
        mWritePos.load(
            std::memory_order_relaxed
        );

    for (
        int32_t i = 0;
        i < frames;
        ++i
    ) {

        dst[
            (pos + i) & kMask
        ] =
            (
                left[i] +
                right[i]
            ) * 0.5f;
    }

    mWritePos.store(
        pos + frames,
        std::memory_order_release
    );
}

// =====================================================
// READ (ui thread)
// =====================================================

void VisualizerBuffer::read(
    float* dst,
    int32_t size
) const {

    const int readBuffer =
        mWriteBuffer.load(
            std::memory_order_acquire
        );

    const float* src =
        readBuffer == 0
        ? mBufferA
        : mBufferB;

    const uint32_t pos =
        mWritePos.load(
            std::memory_order_acquire
        );

    for (
        int32_t i = 0;
        i < size;
        ++i
    ) {

        dst[i] =
            src[
                (pos - size + i)
                & kMask
            ];
    }
}

}