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

    // (Counter overrun dihapus 2026-11-10: tidak pernah dibaca — metrik
    // xrun yang hidup ada di AudioMetrics, dicatat AudioCallback.)
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

        // (Counter underrun dihapus 2026-11-10: tidak pernah dibaca.)
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
// EMPTY
// =====================================================

bool AudioBufferController::empty()
const noexcept {

    return mBuffer.empty();
}

// (freeFrames()/underruns()/overruns()/resetMetrics() dihapus 2026-11-10:
// 0 caller. Metrik xrun yang hidup ada di AudioMetrics.)

} // namespace pristine
