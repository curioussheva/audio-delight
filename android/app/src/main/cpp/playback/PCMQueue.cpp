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

    if (!input || frames == 0) return 0;

    const uint64_t w = writeCount_.load(std::memory_order_relaxed);
    const uint64_t r = readCount_.load(std::memory_order_acquire);

    // safeDiff: 0 kalau r > w. Tanpa ini, `capacity_ - (w - r)` underflow
    // dan write() menulis jauh melebihi kapasitas (lihat komentar di header).
    const size_t used = safeDiff(w, r);
    const size_t free = (used < capacity_) ? (capacity_ - used) : 0u;
    const size_t toWrite = std::min(frames, free);

    if (toWrite == 0) return 0;   // queue penuh: buang, jangan tulis liar

    // Salin dalam dua segmen supaya tidak perlu indexMask per elemen.
    const size_t start = indexMask(static_cast<size_t>(w));
    const size_t first = std::min(toWrite, capacity_ - start);
    std::memcpy(&buffer_[start], input, first * sizeof(float));
    if (toWrite > first) {
        std::memcpy(&buffer_[0], input + first, (toWrite - first) * sizeof(float));
    }

    writeCount_.store(w + toWrite, std::memory_order_release);
    return toWrite;
}

// =====================================================
// READ (COPY PATH)
// =====================================================

size_t PCMQueue::read(float* output, size_t frames) {

    if (!output || frames == 0) return 0;

    const uint64_t r = readCount_.load(std::memory_order_relaxed);
    const uint64_t w = writeCount_.load(std::memory_order_acquire);

    const size_t available = safeDiff(w, r);
    const size_t toRead = std::min(frames, available);

    if (toRead == 0) return 0;

    const size_t start = indexMask(static_cast<size_t>(r));
    const size_t first = std::min(toRead, capacity_ - start);
    std::memcpy(output, &buffer_[start], first * sizeof(float));
    if (toRead > first) {
        std::memcpy(output + first, &buffer_[0], (toRead - first) * sizeof(float));
    }

    readCount_.store(r + toRead, std::memory_order_release);
    return toRead;
}

// =====================================================
// ZERO-COPY WRITE (FAST PATH)
// =====================================================

float* PCMQueue::beginWrite(size_t frames) {

    const uint64_t w = writeCount_.load(std::memory_order_relaxed);
    const uint64_t r = readCount_.load(std::memory_order_acquire);

    const size_t used = safeDiff(w, r);
    const size_t free = (used < capacity_) ? (capacity_ - used) : 0u;
    if (frames > free) return nullptr;

    writeReserve_ = frames;
    writePtr_ = &buffer_[indexMask(static_cast<size_t>(w))];

    return writePtr_;
}

void PCMQueue::commitWrite(size_t frames) {
    writeCount_.fetch_add(frames, std::memory_order_release);
    writeReserve_ = 0;
    writePtr_ = nullptr;
}

// =====================================================
// ZERO-COPY READ (OPTIONAL FUTURE USE)
// =====================================================

float* PCMQueue::beginRead(size_t frames) {

    const uint64_t r = readCount_.load(std::memory_order_relaxed);
    const uint64_t w = writeCount_.load(std::memory_order_acquire);

    if (frames > safeDiff(w, r)) return nullptr;

    readReserve_ = frames;
    readPtr_ = &buffer_[indexMask(static_cast<size_t>(r))];

    return readPtr_;
}

void PCMQueue::commitRead(size_t frames) {
    readCount_.fetch_add(frames, std::memory_order_release);
    readReserve_ = 0;
    readPtr_ = nullptr;
}

// =====================================================
// CLEAR
// =====================================================
//
// SATU operasi, bukan dua.
//
// Versi lama menulis writeIndex_ lalu readIndex_ secara terpisah. Thread audio
// bisa membaca di antara keduanya dan mendapat pasangan (w, r) yang tidak
// konsisten, yang lalu membuat available/free underflow.
//
// Dengan satu counter monotonik, "kosong" didefinisikan sebagai
// readCount_ == writeCount_. Menyamakan keduanya cukup dengan SATU store,
// jadi tidak ada jendela race sama sekali.
void PCMQueue::clear() noexcept {
    // Baca nilai write terkini, lalu set read = write. Satu store atomic.
    // Setelah ini available == 0 dan free == capacity_.
    const uint64_t w = writeCount_.load(std::memory_order_acquire);
    readCount_.store(w, std::memory_order_release);
}

// =====================================================
// QUERIES
// =====================================================

size_t PCMQueue::availableFrames() const noexcept {
    const uint64_t w = writeCount_.load(std::memory_order_acquire);
    const uint64_t r = readCount_.load(std::memory_order_acquire);
    return safeDiff(w, r);
}

size_t PCMQueue::freeFrames() const noexcept {
    const size_t used = availableFrames();
    return (used < capacity_) ? (capacity_ - used) : 0u;
}

size_t PCMQueue::capacityFrames() const noexcept {
    return capacity_;
}

} // namespace pristine::playback
