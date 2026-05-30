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

    state.processingMode.store(
        mode,
        std::memory_order_release
    );

    switch (mode) {

        // =========================================
        // BIT PERFECT
        // =========================================

        case ProcessingMode::BIT_PERFECT:

            state.isDSPEnabled.store(
                false,
                std::memory_order_release
            );

            break;

        // =========================================
        // DSP
        // =========================================

        case ProcessingMode::DSP:

            state.isDSPEnabled.store(
                true,
                std::memory_order_release
            );

            break;

        // =========================================
        // IMMERSIVE
        // =========================================

        case ProcessingMode::IMMERSIVE:

            state.isDSPEnabled.store(
                true,
                std::memory_order_release
            );

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

    return state.processingMode.load(
        std::memory_order_acquire
    );
}

// =====================================================
// IS BIT PERFECT
// =====================================================

bool AudioModeManager::isBitPerfect(
    const AudioState& state
) const noexcept {

    return
        getMode(state) ==
        ProcessingMode::BIT_PERFECT;
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
        ProcessingMode::IMMERSIVE;
}

} // namespace pristine