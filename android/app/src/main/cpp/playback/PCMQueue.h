#pragma once

#include <vector>
#include <atomic>
#include <cstddef>

namespace pristine::playback {

// =====================================================
// REALTIME PCM FIFO (SPSC lock-free, engine-grade)
// =====================================================

class PCMQueue {
public:
    explicit PCMQueue(size_t capacityFramesPowerOfTwo);

    // Producer (decoder thread)
    size_t write(const float* input, size_t frames);

    // Consumer (audio thread)
    size_t read(float* output, size_t frames);

    // Fast reserve/write API (zero-copy path)
    float* beginWrite(size_t frames);
    void commitWrite(size_t frames);

    // Optional read control (future extension)
    float* beginRead(size_t frames);
    void commitRead(size_t frames);

    void clear() noexcept;

    // Queries (approximate, RT safe)
    size_t availableFrames() const noexcept;
    size_t freeFrames() const noexcept;
    size_t capacityFrames() const noexcept;

private:
    std::vector<float> buffer_;
    const size_t capacity_;
    const size_t mask_;

    // SPSC indices
    alignas(64) std::atomic<size_t> writeIndex_{0};
    alignas(64) std::atomic<size_t> readIndex_{0};

    // internal state (for zero-copy staging)
    float* writePtr_ = nullptr;
    float* readPtr_  = nullptr;
    size_t writeReserve_ = 0;
    size_t readReserve_  = 0;

private:
    inline size_t indexMask(size_t v) const noexcept;
};

} // namespace pristine::playback 