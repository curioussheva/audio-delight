#pragma once

#include <atomic>
#include <cassert>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <vector>
#include <algorithm>

namespace pristine {

// =====================================================
// CACHE-ALIGNED ATOMIC INDEX
// =====================================================

struct alignas(64) AtomicIndex {
    std::atomic<uint64_t> value{0};
};

// =====================================================
// LOCK-FREE SPSC RING BUFFER
// Single Producer / Single Consumer
// Realtime-safe for audio thread
// =====================================================

template<typename T>
class RingBuffer {
public:

    explicit RingBuffer(size_t size)
        : mBuffer(size),
          mMask(size - 1) {

        // size MUST be power-of-two
        assert(
            (size & (size - 1)) == 0 &&
            "RingBuffer size must be power of two"
        );
    }

    // =================================================
    // PUSH
    // =================================================

    inline bool push(
        const T* data,
        size_t count
    ) noexcept {

        uint64_t write =
            mWrite.value.load(
                std::memory_order_relaxed
            );

        const uint64_t read =
            mRead.value.load(
                std::memory_order_acquire
            );

        const size_t free =
            mBuffer.size() -
            static_cast<size_t>(
                write - read
            );

        if (count >= free) {
            return false;
        }

        const size_t writePos =
            static_cast<size_t>(
                write & mMask
            );

        const size_t firstPart =
            std::min(
                count,
                mBuffer.size() - writePos
            );

        // contiguous copy
        memcpy(
            &mBuffer[writePos],
            data,
            firstPart * sizeof(T)
        );

        // wrapped copy
        if (count > firstPart) {

            memcpy(
                &mBuffer[0],
                data + firstPart,
                (count - firstPart) * sizeof(T)
            );
        }

        write += count;

        mWrite.value.store(
            write,
            std::memory_order_release
        );

        return true;
    }

    // =================================================
    // POP
    // =================================================

    inline size_t pop(
        T* dst,
        size_t count
    ) noexcept {

        uint64_t read =
            mRead.value.load(
                std::memory_order_relaxed
            );

        const uint64_t write =
            mWrite.value.load(
                std::memory_order_acquire
            );

        const size_t availableSamples =
            static_cast<size_t>(
                write - read
            );

        const size_t toRead =
            std::min(
                count,
                availableSamples
            );

        if (toRead == 0) {
            return 0;
        }

        const size_t readPos =
            static_cast<size_t>(
                read & mMask
            );

        const size_t firstPart =
            std::min(
                toRead,
                mBuffer.size() - readPos
            );

        // contiguous copy
        memcpy(
            dst,
            &mBuffer[readPos],
            firstPart * sizeof(T)
        );

        // wrapped copy
        if (toRead > firstPart) {

            memcpy(
                dst + firstPart,
                &mBuffer[0],
                (toRead - firstPart) * sizeof(T)
            );
        }

        read += toRead;

        mRead.value.store(
            read,
            std::memory_order_release
        );

        return toRead;
    }

    // =================================================
    // PUSH INTERLEAVED STEREO
    // =================================================

    inline bool pushInterleavedStereo(
        const float* left,
        const float* right,
        size_t frames
    ) noexcept {

        const size_t samples =
            frames * 2;

        uint64_t write =
            mWrite.value.load(
                std::memory_order_relaxed
            );

        const uint64_t read =
            mRead.value.load(
                std::memory_order_acquire
            );

        const size_t free =
            mBuffer.size() -
            static_cast<size_t>(
                write - read
            );

        if (samples >= free) {
            return false;
        }

        for (
            size_t i = 0;
            i < frames;
            ++i
        ) {

            mBuffer[
                write & mMask
            ] = left[i];

            ++write;

            mBuffer[
                write & mMask
            ] = right[i];

            ++write;
        }

        mWrite.value.store(
            write,
            std::memory_order_release
        );

        return true;
    }

    // =================================================
    // POP INTERLEAVED STEREO
    // =================================================

    inline size_t popInterleavedStereo(
        float* left,
        float* right,
        size_t frames
    ) noexcept {

        uint64_t read =
            mRead.value.load(
                std::memory_order_relaxed
            );

        const uint64_t write =
            mWrite.value.load(
                std::memory_order_acquire
            );

        const size_t availableSamples =
            static_cast<size_t>(
                write - read
            );

        const size_t availableFrames =
            availableSamples / 2;

        const size_t toRead =
            std::min(
                frames,
                availableFrames
            );

        for (
            size_t i = 0;
            i < toRead;
            ++i
        ) {

            left[i] =
                mBuffer[
                    read & mMask
                ];

            ++read;

            right[i] =
                mBuffer[
                    read & mMask
                ];

            ++read;
        }

        mRead.value.store(
            read,
            std::memory_order_release
        );

        return toRead;
    }

    // =================================================
    // AVAILABLE
    // =================================================

    inline size_t available() const noexcept {

        return static_cast<size_t>(
            mWrite.value.load(
                std::memory_order_acquire
            ) -
            mRead.value.load(
                std::memory_order_acquire
            )
        );
    }

    // =================================================
    // FREE SPACE
    // =================================================

    inline size_t freeSpace() const noexcept {

        return
            mBuffer.size() -
            available();
    }

    // =================================================
    // CAPACITY
    // =================================================

    inline size_t capacity() const noexcept {

        return mBuffer.size();
    }

    // =================================================
    // EMPTY
    // =================================================

    inline bool empty() const noexcept {

        return available() == 0;
    }

    // =================================================
    // FULL
    // =================================================

    inline bool full() const noexcept {

        return freeSpace() <= 1;
    }

    // =================================================
    // CLEAR
    // =================================================

    inline void clear() noexcept {

        mWrite.value.store(
            0,
            std::memory_order_release
        );

        mRead.value.store(
            0,
            std::memory_order_release
        );
    }

private:

    std::vector<T> mBuffer;

    size_t mMask;

    AtomicIndex mWrite;
    AtomicIndex mRead;
};

} // namespace pristine 