#pragma once

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <mutex>

namespace pristine::decoder {

// =====================================================
// DECODER LIFECYCLE
// =====================================================

enum class DecoderState {
    Idle,
    Opening,
    Ready,
    Decoding,
    Seeking,
    Flushing,
    Draining,
    EndOfStream,   // <---
    Error,
    Closed
};
 
// =====================================================
// THREAD-SAFE DECODER STATE
// =====================================================

class AtomicDecoderState {
public:
    AtomicDecoderState() = default;

    // -----------------------------------------
    // Accessors
    // -----------------------------------------

    [[nodiscard]]
    DecoderState get() const noexcept {
        return state_.load(std::memory_order_acquire);
    }

    void set(DecoderState state) noexcept {
        {
            std::lock_guard<std::mutex> lock(mutex_);
            state_.store(state, std::memory_order_release);
        }

        cv_.notify_all();
    }

    [[nodiscard]]
    bool is(DecoderState state) const noexcept {
        return get() == state;
    }

    [[nodiscard]]
    bool isActive() const noexcept {
        const auto s = get();

        return s == DecoderState::Decoding ||
               s == DecoderState::Seeking ||
               s == DecoderState::Flushing;
    }

    [[nodiscard]]
    bool canDecode() const noexcept {
        const auto s = get();

        return s == DecoderState::Ready ||
               s == DecoderState::Decoding;
    }

    [[nodiscard]]
    bool canSeek() const noexcept {
        const auto s = get();

        return s == DecoderState::Ready ||
               s == DecoderState::Decoding;
    }

    [[nodiscard]]
    bool hasError() const noexcept {
        return get() == DecoderState::Error;
    }

    // -----------------------------------------
    // Wait
    // -----------------------------------------

    [[nodiscard]]
    bool waitFor(
        DecoderState expected,
        std::chrono::milliseconds timeout
    ) {
        std::unique_lock<std::mutex> lock(mutex_);

        return cv_.wait_for(
            lock,
            timeout,
            [&]() {
                return state_.load(std::memory_order_acquire)
                    == expected;
            }
        );
    }

private:
    std::atomic<DecoderState>
        state_{DecoderState::Idle};

    mutable std::mutex
        mutex_;

    mutable std::condition_variable
        cv_;
};

} // namespace pristine::decoder