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

    // audio thread — varian sadar-stride untuk buffer interleaved
    // (L,R,L,R,...). Dipakai jalur shortcut BitPerfect di
    // AudioCallback::applyPipeline, yang tidak lagi men-deinterleave
    // ke mLeft/mRight. Mixdown + sanitasi SAMA PERSIS dengan write()
    // (lihat mixdownSanitized di .cpp) — bukan jalur kedua yang bisa drift.
    void writeInterleaved(
        const float* interleaved,
        int32_t frames
    );

    // ui thread
    void read(
        float* dst,
        int32_t size
    ) const;

private:

    alignas(16) float mBufferA[kSize];

    std::atomic<uint32_t> mWritePos{0};
};

} 