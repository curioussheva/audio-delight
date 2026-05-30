// =====================================================
// core/AudioState.h
// =====================================================

#pragma once

#include <array>
#include <atomic>

#include "AudioTypes.h"

namespace pristine {

// =====================================================
// REALTIME ENGINE STATE
// =====================================================

class AudioState {
public:

    // =============================================
    // RUNNING
    // =============================================

    inline void setRunning(
        bool value
    ) {

        mRunning.store(
            value,
            std::memory_order_release
        );
    }

    inline bool isRunning() const {

        return mRunning.load(
            std::memory_order_acquire
        );
    }

    // =============================================
    // DSP ENABLE
    // =============================================

    inline void setDSPEnabled(
        bool value
    ) {

        mDSPEnabled.store(
            value,
            std::memory_order_release
        );
    }

    inline bool isDSPEnabled() const {

        return mDSPEnabled.load(
            std::memory_order_acquire
        );
    }

    // =============================================
    // LIMITER ENABLE
    // =============================================

    inline void setLimiterEnabled(
        bool value
    ) {

        mLimiterEnabled.store(
            value,
            std::memory_order_release
        );
    }

    inline bool isLimiterEnabled() const {

        return mLimiterEnabled.load(
            std::memory_order_acquire
        );
    }

    // =============================================
    // EXCLUSIVE MODE
    // =============================================

    inline void setExclusiveMode(
        bool value
    ) {

        mExclusiveMode.store(
            value,
            std::memory_order_release
        );
    }

    inline bool exclusiveMode() const {

        return mExclusiveMode.load(
            std::memory_order_acquire
        );
    }

    // =============================================
    // PROCESSING MODE
    // =============================================

    inline void setProcessingMode(
        ProcessingMode mode
    ) {

        mProcessingMode.store(
            mode,
            std::memory_order_release
        );
    }

    inline ProcessingMode
    processingMode() const {

        return mProcessingMode.load(
            std::memory_order_acquire
        );
    }

    // =============================================
    // MASTER GAIN
    // =============================================

    inline void setMasterGain(
        float value
    ) {

        mMasterGain.store(
            value,
            std::memory_order_release
        );
    }

    inline float masterGain() const {

        return mMasterGain.load(
            std::memory_order_acquire
        );
    }

    // =============================================
    // BALANCE
    // =============================================

    inline void setBalance(
        float value
    ) {

        mBalance.store(
            value,
            std::memory_order_release
        );
    }

    inline float balance() const {

        return mBalance.load(
            std::memory_order_acquire
        );
    }

    // =============================================
    // STEREO WIDTH
    // =============================================

    inline void setStereoWidth(
        float value
    ) {

        mStereoWidth.store(
            value,
            std::memory_order_release
        );
    }

    inline float stereoWidth() const {

        return mStereoWidth.load(
            std::memory_order_acquire
        );
    }

    // =============================================
    // SOLFEGGIO
    // =============================================

    inline void setSolfeggioFreq(
        float value
    ) {

        mSolfeggioFreq.store(
            value,
            std::memory_order_release
        );
    }

    inline float solfeggioFreq() const {

        return mSolfeggioFreq.load(
            std::memory_order_acquire
        );
    }

    // =============================================
    // BRAINWAVE
    // =============================================

    inline void setBrainwaveFreq(
        float value
    ) {

        mBrainwaveFreq.store(
            value,
            std::memory_order_release
        );
    }

    inline float brainwaveFreq() const {

        return mBrainwaveFreq.load(
            std::memory_order_acquire
        );
    }

    // =============================================
    // RESONANCE
    // =============================================

    inline void setResonanceIntensity(
        float value
    ) {

        mResonanceIntensity.store(
            value,
            std::memory_order_release
        );
    }

    inline float resonanceIntensity() const {

        return mResonanceIntensity.load(
            std::memory_order_acquire
        );
    }

    // =============================================
    // EQ
    // =============================================

    inline void setEqGain(
        int band,
        float gainDb
    ) {

        if (
            band < 0 ||
            band >= 10
        ) {
            return;
        }

        mEqGain[band].store(
            gainDb,
            std::memory_order_release
        );
    }

    inline float eqGain(
        int band
    ) const {

        if (
            band < 0 ||
            band >= 10
        ) {
            return 0.0f;
        }

        return mEqGain[band].load(
            std::memory_order_acquire
        );
    }

private:

    // =============================================
    // ENGINE STATE
    // =============================================

    std::atomic<bool>
        mRunning{false};

    std::atomic<bool>
        mDSPEnabled{true};

    std::atomic<bool>
        mLimiterEnabled{true};

    std::atomic<bool>
        mExclusiveMode{false};

    // =============================================
    // PROCESSING MODE
    // =============================================

    std::atomic<ProcessingMode>
        mProcessingMode{
            ProcessingMode::DSP
        };

    // =============================================
    // OUTPUT
    // =============================================

    std::atomic<float>
        mMasterGain{1.0f};

    std::atomic<float>
        mBalance{0.0f};

    std::atomic<float>
        mStereoWidth{1.0f};

    // =============================================
    // IMMERSIVE AUDIO LAB
    // =============================================

    std::atomic<float>
        mSolfeggioFreq{528.0f};

    std::atomic<float>
        mBrainwaveFreq{0.0f};

    std::atomic<float>
        mResonanceIntensity{0.5f};

    // =============================================
    // EQ
    // =============================================

    std::array<
        std::atomic<float>,
        10
    > mEqGain {
        0.0f, 0.0f, 0.0f, 0.0f, 0.0f,
        0.0f, 0.0f, 0.0f, 0.0f, 0.0f
    };
};

} // namespace pristine