#include "AudioBufferController.h"

namespace pristine {

// =====================================================
// CONSTRUCTOR
// =====================================================

AudioBufferController::AudioBufferController()
    : mBuffer(kRingBufferSize) {
}

// =====================================================
// PUSH INTERLEAVED
// =====================================================

bool AudioBufferController::pushInterleaved(
    const float* data,
    uint32_t frames
) noexcept {

    const size_t samples =
        static_cast<size_t>(frames) * 2;

    const bool ok =
        mBuffer.push(
            data,
            samples
        );

    if (!ok) {

        mOverruns.fetch_add(
            1,
            std::memory_order_relaxed
        );
    }

    return ok;
}

// =====================================================
// POP STEREO
// =====================================================

uint32_t AudioBufferController::popStereo(
    float* left,
    float* right,
    uint32_t frames
) noexcept {

    const size_t samplesNeeded =
        static_cast<size_t>(frames) * 2;

    const size_t available =
        mBuffer.available();

    if (available < samplesNeeded) {

        mUnderruns.fetch_add(
            1,
            std::memory_order_relaxed
        );

        return 0;
    }

    alignas(16)
    float interleaved[
        kMaxFramesPerCallback * 2
    ];

    const size_t popped =
        mBuffer.pop(
            interleaved,
            samplesNeeded
        );

    const size_t outFrames =
        popped / 2;

    for (
        size_t i = 0;
        i < outFrames;
        ++i
    ) {

        left[i] =
            interleaved[i * 2];

        right[i] =
            interleaved[i * 2 + 1];
    }

    return static_cast<uint32_t>(
        outFrames
    );
}

// =====================================================
// CLEAR
// =====================================================

void AudioBufferController::clear() noexcept {

    mBuffer.clear();
}

// =====================================================
// AVAILABLE FRAMES
// =====================================================

uint32_t
AudioBufferController::availableFrames()
const noexcept {

    return static_cast<uint32_t>(
        mBuffer.available() / 2
    );
}

// =====================================================
// FREE FRAMES
// =====================================================

uint32_t
AudioBufferController::freeFrames()
const noexcept {

    return static_cast<uint32_t>(
        mBuffer.freeSpace() / 2
    );
}

// =====================================================
// EMPTY
// =====================================================

bool AudioBufferController::empty()
const noexcept {

    return mBuffer.empty();
}

// =====================================================
// UNDERRUNS
// =====================================================

uint64_t
AudioBufferController::underruns()
const noexcept {

    return mUnderruns.load(
        std::memory_order_relaxed
    );
}

// =====================================================
// OVERRUNS
// =====================================================

uint64_t
AudioBufferController::overruns()
const noexcept {

    return mOverruns.load(
        std::memory_order_relaxed
    );
}

// =====================================================
// RESET METRICS
// =====================================================

void AudioBufferController::resetMetrics()
noexcept {

    mUnderruns.store(
        0,
        std::memory_order_relaxed
    );

    mOverruns.store(
        0,
        std::memory_order_relaxed
    );
}

} // namespace pristine
