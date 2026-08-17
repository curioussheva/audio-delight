#include "PCMQueue.h"

#include <algorithm>
#include <cstring>

namespace pristine::playback {

// =====================================================
// CONSTRUCTOR
// =====================================================

PCMQueue::PCMQueue(size_t capacityFramesPowerOfTwo)
    : buffer_(capacityFramesPowerOfTwo)
    , capacity_(capacityFramesPowerOfTwo)
    , mask_(capacityFramesPowerOfTwo - 1) {}

// =====================================================
// FAST INDEX MASK (NO MODULO)
// =====================================================

inline size_t PCMQueue::indexMask(size_t v) const noexcept {
    return v & mask_;
}

// =====================================================
// WRITE (COPY PATH)
// =====================================================

size_t PCMQueue::write(const float* input, size_t frames) {

    const size_t w = writeIndex_.load(std::memory_order_relaxed);
    const size_t r = readIndex_.load(std::memory_order_acquire);

    size_t free = capacity_ - (w - r);
    size_t toWrite = std::min(frames, free);

    for (size_t i = 0; i < toWrite; ++i) {
        buffer_[indexMask(w + i)] = input[i];
    }

    writeIndex_.store(w + toWrite, std::memory_order_release);
    return toWrite;
}

// =====================================================
// READ (COPY PATH)
// =====================================================

size_t PCMQueue::read(float* output, size_t frames) {

    const size_t r = readIndex_.load(std::memory_order_relaxed);
    const size_t w = writeIndex_.load(std::memory_order_acquire);

    size_t available = w - r;
    size_t toRead = std::min(frames, available);

    for (size_t i = 0; i < toRead; ++i) {
        output[i] = buffer_[indexMask(r + i)];
    }

    readIndex_.store(r + toRead, std::memory_order_release);
    return toRead;
}

// =====================================================
// ZERO-COPY WRITE (FAST PATH)
// =====================================================

float* PCMQueue::beginWrite(size_t frames) {

    const size_t w = writeIndex_.load(std::memory_order_relaxed);
    const size_t r = readIndex_.load(std::memory_order_acquire);

    size_t free = capacity_ - (w - r);
    if (frames > free) return nullptr;

    writeReserve_ = frames;
    writePtr_ = &buffer_[indexMask(w)];

    return writePtr_;
}

void PCMQueue::commitWrite(size_t frames) {
    writeIndex_.store(
        writeIndex_.load(std::memory_order_relaxed) + frames,
        std::memory_order_release
    );

    writeReserve_ = 0;
    writePtr_ = nullptr;
}

// =====================================================
// ZERO-COPY READ (OPTIONAL FUTURE USE)
// =====================================================

float* PCMQueue::beginRead(size_t frames) {

    const size_t r = readIndex_.load(std::memory_order_relaxed);
    const size_t w = writeIndex_.load(std::memory_order_acquire);

    size_t available = w - r;
    if (frames > available) return nullptr;

    readReserve_ = frames;
    readPtr_ = &buffer_[indexMask(r)];

    return readPtr_;
}

void PCMQueue::commitRead(size_t frames) {
    readIndex_.store(
        readIndex_.load(std::memory_order_relaxed) + frames,
        std::memory_order_release
    );

    readReserve_ = 0;
    readPtr_ = nullptr;
}

// =====================================================
// CLEAR
// =====================================================

void PCMQueue::clear() noexcept {
    writeIndex_.store(0, std::memory_order_relaxed);
    readIndex_.store(0, std::memory_order_release);
}

// =====================================================
// QUERIES
// =====================================================

size_t PCMQueue::availableFrames() const noexcept {
    const size_t w = writeIndex_.load(std::memory_order_acquire);
    const size_t r = readIndex_.load(std::memory_order_acquire);
    return w - r;
}

size_t PCMQueue::freeFrames() const noexcept {
    return capacity_ - availableFrames();
}

size_t PCMQueue::capacityFrames() const noexcept {
    return capacity_;
}

} // namespace pristine::playback 