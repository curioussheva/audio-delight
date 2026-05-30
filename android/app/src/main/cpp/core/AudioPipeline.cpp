// =====================================================
// core/AudioPipeline.cpp
// =====================================================

#include "AudioPipeline.h"

namespace pristine {

// =====================================================
// CONSTRUCTOR
// =====================================================

AudioPipeline::AudioPipeline() = default;

// =====================================================
// PREPARE
// =====================================================

void AudioPipeline::prepare(
    int32_t sampleRate,
    int32_t maxFrames
) {

    mSampleRate =
        sampleRate;

    mMaxFrames =
        maxFrames;

    mDSP.prepare(
        sampleRate,
        maxFrames
    );
}

// =====================================================
// RESET
// =====================================================

void AudioPipeline::reset() {

    mDSP.reset();
}

// =====================================================
// PROCESS
// =====================================================

void AudioPipeline::process(
    float* left,
    float* right,
    int32_t frames,
    const AudioState& state
) noexcept {

    switch (
        state.processingMode.load(
            std::memory_order_acquire
        )
    ) {

        case ProcessingMode::BIT_PERFECT:

            processBitPerfect(
                left,
                right,
                frames
            );

            break;

        case ProcessingMode::DSP:

            processDSP(
                left,
                right,
                frames,
                state
            );

            break;

        case ProcessingMode::IMMERSIVE:

            processImmersive(
                left,
                right,
                frames,
                state
            );

            break;
    }
}

// =====================================================
// BIT PERFECT
// =====================================================

void AudioPipeline::processBitPerfect(
    float*,
    float*,
    int32_t
) noexcept {

    // intentionally bypass all DSP
}

// =====================================================
// DSP
// =====================================================

void AudioPipeline::processDSP(
    float* left,
    float* right,
    int32_t frames,
    const AudioState&
) noexcept {

    mDSP.process(
        left,
        right,
        frames
    );
}

// =====================================================
// IMMERSIVE
// =====================================================

void AudioPipeline::processImmersive(
    float* left,
    float* right,
    int32_t frames,
    const AudioState& state
) noexcept {

    // =============================================
    // BASE DSP
    // =============================================

    mDSP.process(
        left,
        right,
        frames
    );

    // =============================================
    // FUTURE:
    // - Solfeggio resonance
    // - binaural beat
    // - harmonic field
    // - spatial enhancement
    // - meditation ambience
    // =============================================

    (void)state;
}

} // namespace pristine