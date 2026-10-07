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

    // Immersive ikut disiapkan di sini, bukan saat mode dipilih: perpindahan
    // mode harus bisa terjadi live, dan menyiapkan rantai resonan di audio
    // thread saat user menekan tombol berarti alokasi + perhitungan koefisien
    // di jalur realtime.
    mImmersive.prepare(sampleRate);
}

// =====================================================
// RESET
// =====================================================

void AudioPipeline::reset() {

    mDSP.reset();

    mImmersive.reset();
}

// =====================================================
// PROCESS
// =====================================================

void AudioPipeline::process(
    float* left,
    float* right,
    int32_t frames,
    const DSPParameters& params
) noexcept {

    switch (
        params.processingMode
    ) {

        case ProcessingMode::BitPerfect:

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
                params
            );

            break;

        case ProcessingMode::Immersive:

            processImmersive(
                left,
                right,
                frames,
                params
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
    const DSPParameters&
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
    const DSPParameters& params
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
    // IMMERSIVE CHAIN
    // =============================================
    //
    // Rantai nyata (Solfeggio -> Harmonic -> Spatial -> Brainwave), dipindahkan
    // dari cpp/modes/ImmersivePipeline. Sebelumnya blok ini hanya komentar
    // "FUTURE" - sekarang benar-benar memproses.
    mImmersive.process(
        left,
        right,
        frames,
        params
    );
}

} // namespace pristine 