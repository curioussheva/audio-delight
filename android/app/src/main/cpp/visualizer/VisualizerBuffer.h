// =====================================================
// visualizer/VisualizerBuffer.h
// =====================================================

#pragma once

#include <atomic>
#include <cstdint>
#include <cstring>

namespace pristine {

class VisualizerBuffer {
public:

    static constexpr uint32_t kSize = 2048;
    static constexpr uint32_t kMask = kSize - 1;

    VisualizerBuffer();

    // audio thread
    void write(
        const float* left,
        const float* right,
        int32_t frames
    );

    // ui thread
    void read(
        float* dst,
        int32_t size
    ) const;

private:

    alignas(16) float mBufferA[kSize];
    alignas(16) float mBufferB[kSize];

    std::atomic<int> mWriteBuffer{0};

    std::atomic<uint32_t> mWritePos{0};
};

} 