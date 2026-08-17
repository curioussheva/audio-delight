#pragma once

#include "PlaybackTypes.h"

#include <cstdint>

namespace pristine::playback {

// =====================================================
// TRANSITION MODE
// =====================================================

enum class TransitionMode {
    Gap,
    Gapless,
    Crossfade,
    BitPerfect
};

// =====================================================
// FADE CURVE
// =====================================================

enum class FadeCurve {
    Linear,
    Logarithmic,
    Exponential,
    SCurve
};

// =====================================================
// CONFIGURATION
// =====================================================

struct TransitionConfig {

    TransitionMode mode =
        TransitionMode::Gapless;

    uint32_t prebufferFrames =
        48000 * 5;

    uint32_t crossfadeDurationFrames =
        48000 * 2;

    FadeCurve fadeCurve =
        FadeCurve::SCurve;

    uint32_t gapDurationFrames =
        4800;

    bool maintainFormat =
        true;
};

// =====================================================
// SCHEDULER STATE
// =====================================================

enum class SchedulerState {
    Idle,
    Monitoring,
    PrebufferRequested,
    TransitionPending,
    Transitioning
};

// =====================================================
// EVENTS
// =====================================================

struct TransitionEvent {

    TransitionMode mode =
        TransitionMode::Gapless;

    uint64_t transitionFrame = 0;

    float progress = 0.0f;
};

}