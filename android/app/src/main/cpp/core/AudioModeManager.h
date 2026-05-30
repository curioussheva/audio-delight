#pragma once

#include "AudioState.h"

namespace pristine {

// =====================================================
// AUDIO MODE MANAGER
// Handles runtime mode switching
// =====================================================

class AudioModeManager {
public:

    AudioModeManager() = default;

    // =============================================
    // MODE
    // =============================================

    void setMode(
        AudioState& state,
        ProcessingMode mode
    ) noexcept;

    ProcessingMode getMode(
        const AudioState& state
    ) const noexcept;

    // =============================================
    // HELPERS
    // =============================================

    bool isBitPerfect(
        const AudioState& state
    ) const noexcept;

    bool isDSPMode(
        const AudioState& state
    ) const noexcept;

    bool isImmersiveMode(
        const AudioState& state
    ) const noexcept;
};

} // namespace pristine