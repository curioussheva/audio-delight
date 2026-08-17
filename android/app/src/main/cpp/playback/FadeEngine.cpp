#include "FadeEngine.h"

#include <algorithm>
#include <cmath>

namespace pristine::playback {

// =====================================================
// PUBLIC
// =====================================================

void FadeEngine::generateCurve(
    FadeCurve type,
    uint32_t durationFrames
) {
    currentType_ = type;
    durationFrames_ = durationFrames;

    fadeInCurve_.resize(durationFrames_);
    fadeOutCurve_.resize(durationFrames_);

    switch (type) {

        case FadeCurve::Linear:
            buildLinear();
            break;

        case FadeCurve::Logarithmic:
            buildLogarithmic();
            break;

        case FadeCurve::Exponential:
            buildExponential();
            break;

        case FadeCurve::SCurve:
            buildSCurve();
            break;
    }
}

void FadeEngine::reset() {

    fadeInCurve_.clear();
    fadeOutCurve_.clear();

    durationFrames_ = 0;
}

uint32_t FadeEngine::durationFrames() const noexcept {

    return durationFrames_;
}

bool FadeEngine::empty() const noexcept {

    return durationFrames_ == 0;
}

// =====================================================
// GAIN LOOKUP
// =====================================================

float FadeEngine::fadeInGainAt(
    uint32_t frame
) const noexcept {

    if (
        fadeInCurve_.empty()
    ) {
        return 1.0f;
    }

    frame = std::min(
        frame,
        durationFrames_ - 1
    );

    return fadeInCurve_[frame];
}

float FadeEngine::fadeOutGainAt(
    uint32_t frame
) const noexcept {

    if (
        fadeOutCurve_.empty()
    ) {
        return 1.0f;
    }

    frame = std::min(
        frame,
        durationFrames_ - 1
    );

    return fadeOutCurve_[frame];
}

// =====================================================
// APPLY FADE
// =====================================================

void FadeEngine::applyFadeIn(
    float* buffer,
    uint32_t frames,
    uint32_t channels,
    uint32_t offsetFrames
) const noexcept {

    if (
        !buffer ||
        empty()
    ) {
        return;
    }

    for (
        uint32_t frame = 0;
        frame < frames;
        ++frame
    ) {

        const float gain =
            fadeInGainAt(
                offsetFrames + frame
            );

        const uint32_t base =
            frame * channels;

        for (
            uint32_t ch = 0;
            ch < channels;
            ++ch
        ) {
            buffer[
                base + ch
            ] *= gain;
        }
    }
}

void FadeEngine::applyFadeOut(
    float* buffer,
    uint32_t frames,
    uint32_t channels,
    uint32_t offsetFrames
) const noexcept {

    if (
        !buffer ||
        empty()
    ) {
        return;
    }

    for (
        uint32_t frame = 0;
        frame < frames;
        ++frame
    ) {

        const float gain =
            fadeOutGainAt(
                offsetFrames + frame
            );

        const uint32_t base =
            frame * channels;

        for (
            uint32_t ch = 0;
            ch < channels;
            ++ch
        ) {
            buffer[
                base + ch
            ] *= gain;
        }
    }
}

// =====================================================
// CROSSFADE
// =====================================================

void FadeEngine::crossfade(
    const float* fadeOutBuffer,
    const float* fadeInBuffer,
    float* outputBuffer,
    uint32_t frames,
    uint32_t channels,
    uint32_t offsetFrames
) const noexcept {

    if (
        !fadeOutBuffer ||
        !fadeInBuffer ||
        !outputBuffer
    ) {
        return;
    }

    for (
        uint32_t frame = 0;
        frame < frames;
        ++frame
    ) {

        const float outGain =
            fadeOutGainAt(
                offsetFrames + frame
            );

        const float inGain =
            fadeInGainAt(
                offsetFrames + frame
            );

        const uint32_t base =
            frame * channels;

        for (
            uint32_t ch = 0;
            ch < channels;
            ++ch
        ) {

            outputBuffer[
                base + ch
            ] =
                fadeOutBuffer[
                    base + ch
                ] * outGain
                +
                fadeInBuffer[
                    base + ch
                ] * inGain;
        }
    }
}

// =====================================================
// CURVE BUILDERS
// =====================================================

void FadeEngine::buildLinear() {

    if (
        durationFrames_ == 0
    ) {
        return;
    }

    const float denom =
        static_cast<float>(
            durationFrames_ - 1
        );

    for (
        uint32_t i = 0;
        i < durationFrames_;
        ++i
    ) {

        const float t =
            static_cast<float>(i)
            / denom;

        fadeInCurve_[i] = t;
        fadeOutCurve_[i] = 1.0f - t;
    }
}

void FadeEngine::buildLogarithmic() {

    if (
        durationFrames_ == 0
    ) {
        return;
    }

    const float denom =
        static_cast<float>(
            durationFrames_ - 1
        );

    for (
        uint32_t i = 0;
        i < durationFrames_;
        ++i
    ) {

        const float t =
            static_cast<float>(i)
            / denom;

        const float in =
            std::log10f(
                1.0f + 9.0f * t
            );

        fadeInCurve_[i] = in;
        fadeOutCurve_[i] = 1.0f - in;
    }
}

void FadeEngine::buildExponential() {

    if (
        durationFrames_ == 0
    ) {
        return;
    }

    const float denom =
        static_cast<float>(
            durationFrames_ - 1
        );

    for (
        uint32_t i = 0;
        i < durationFrames_;
        ++i
    ) {

        const float t =
            static_cast<float>(i)
            / denom;

        const float in =
            t * t;

        fadeInCurve_[i] = in;
        fadeOutCurve_[i] = 1.0f - in;
    }
}

void FadeEngine::buildSCurve() {

    if (
        durationFrames_ == 0
    ) {
        return;
    }

    const float denom =
        static_cast<float>(
            durationFrames_ - 1
        );

    for (
        uint32_t i = 0;
        i < durationFrames_;
        ++i
    ) {

        const float t =
            static_cast<float>(i)
            / denom;

        const float in =
            t * t * (
                3.0f - 2.0f * t
            );

        fadeInCurve_[i] = in;
        fadeOutCurve_[i] = 1.0f - in;
    }
}

} // namespace pristine::playback