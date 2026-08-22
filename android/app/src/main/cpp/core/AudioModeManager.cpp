// =====================================================
// core/AudioModeManager.cpp
// =====================================================

#include "AudioModeManager.h"

namespace pristine {

// =====================================================
// SET MODE
// =====================================================

void AudioModeManager::setMode(
    AudioState& state,
    ProcessingMode mode
) noexcept {

    state.setProcessingMode(mode);

    switch (mode) {

        // =========================================
        // BIT PERFECT
        // =========================================

        case ProcessingMode::BitPerfect:

            state.setDSPEnabled(false);

            break;

        // =========================================
        // DSP
        // =========================================

        case ProcessingMode::DSP:

            state.setDSPEnabled(true);

            break;

        // =========================================
        // IMMERSIVE
        // =========================================

        case ProcessingMode::Immersive:

            state.setDSPEnabled(true);

            break;
    }
}

// =====================================================
// GET MODE
// =====================================================

ProcessingMode
AudioModeManager::getMode(
    const AudioState& state
) const noexcept {

    return state.processingMode();
}

// =====================================================
// IS BIT PERFECT
// =====================================================

bool AudioModeManager::isBitPerfect(
    const AudioState& state
) const noexcept {

    return
        getMode(state) ==
        ProcessingMode::BitPerfect;
}

// =====================================================
// IS DSP
// =====================================================

bool AudioModeManager::isDSPMode(
    const AudioState& state
) const noexcept {

    return
        getMode(state) ==
        ProcessingMode::DSP;
}

// =====================================================
// IS IMMERSIVE
// =====================================================

bool AudioModeManager::isImmersiveMode(
    const AudioState& state
) const noexcept {

    return
        getMode(state) ==
        ProcessingMode::Immersive;
}

} // namespace pristine