#pragma once

#include "SchedulerTypes.h"

#include <vector>
#include <cstdint>

namespace pristine::playback {

// =====================================================
// FADE ENGINE
// =====================================================

class FadeEngine {
public:

    FadeEngine() = default;
    ~FadeEngine() = default;

    void generateCurve(
        FadeCurve type,
        uint32_t durationFrames
    );

    // Crossfade (2026-11-20): detik -> frame pada laju stream, dengan
    // clamp 0..12 dtk (batas setting crossfade). Dipakai loadTrack()
    // untuk menghitung kurva fade-out; 64-bit di dalam supaya
    // rate * detik tidak overflow uint32 (768 kHz * 12 dtk = 9,2e9).
    [[nodiscard]]
    static uint32_t secondsToFrames(
        uint32_t sampleRate,
        float seconds
    ) noexcept;

    void reset();

    [[nodiscard]]
    uint32_t durationFrames() const noexcept;

    [[nodiscard]]
    bool empty() const noexcept;

    [[nodiscard]]
    float fadeInGainAt(
        uint32_t frame
    ) const noexcept;

    [[nodiscard]]
    float fadeOutGainAt(
        uint32_t frame
    ) const noexcept;

    void applyFadeIn(
        float* buffer,
        uint32_t frames,
        uint32_t channels,
        uint32_t offsetFrames = 0
    ) const noexcept;

    void applyFadeOut(
        float* buffer,
        uint32_t frames,
        uint32_t channels,
        uint32_t offsetFrames = 0
    ) const noexcept;

    void crossfade(
        const float* fadeOutBuffer,
        const float* fadeInBuffer,
        float* outputBuffer,
        uint32_t frames,
        uint32_t channels,
        uint32_t offsetFrames = 0
    ) const noexcept;

private:

    std::vector<float>
        fadeInCurve_;

    std::vector<float>
        fadeOutCurve_;

    FadeCurve currentType_ =
        FadeCurve::Linear;

    uint32_t durationFrames_ = 0;

private:

    void buildLinear();

    void buildLogarithmic();

    void buildExponential();

    void buildSCurve();
};

} // namespace pristine::playback