// =====================================================
// core/AudioConfig.h
// =====================================================

#pragma once

#include <atomic>

#include "AudioConstants.h"
#include "AudioTypes.h"

namespace pristine {

// =====================================================
// GLOBAL ENGINE CONFIG
// =====================================================

class AudioConfig {
public:

    // =============================================
    // SINGLETON
    // =============================================

    static AudioConfig& getInstance();

    // =============================================
    // SAMPLE RATE
    // =============================================

    inline void setSampleRate(
        float rate
    ) {

        mSampleRate.store(
            rate,
            std::memory_order_release
        );
    }

    inline float getSampleRate() const {

        return mSampleRate.load(
            std::memory_order_acquire
        );
    }

    // =============================================
    // CHANNEL COUNT
    // =============================================

    inline void setChannelCount(
        int32_t count
    ) {

        mChannelCount.store(
            count,
            std::memory_order_release
        );
    }

    inline int32_t
    getChannelCount() const {

        return mChannelCount.load(
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
    getProcessingMode() const {

        return mProcessingMode.load(
            std::memory_order_acquire
        );
    }

    // =============================================
    // AUDIO ROUTE
    // =============================================

    inline void setAudioRoute(
        AudioRoute route
    ) {

        mAudioRoute.store(
            route,
            std::memory_order_release
        );
    }

    inline AudioRoute
    getAudioRoute() const {

        return mAudioRoute.load(
            std::memory_order_acquire
        );
    }

    // =============================================
    // EXCLUSIVE MODE
    // =============================================

    inline void setExclusiveMode(
        bool enabled
    ) {

        mExclusiveMode.store(
            enabled,
            std::memory_order_release
        );
    }

    inline bool
    isExclusiveMode() const {

        return mExclusiveMode.load(
            std::memory_order_acquire
        );
    }

    // =============================================
    // PERFORMANCE MODE
    // =============================================

    inline void setPerformanceMode(
        PerformanceMode mode
    ) {

        mPerformanceMode.store(
            mode,
            std::memory_order_release
        );
    }

    inline PerformanceMode
    getPerformanceMode() const {

        return mPerformanceMode.load(
            std::memory_order_acquire
        );
    }

private:

    AudioConfig() = default;

private:

    // =============================================
    // STREAM CONFIG
    // =============================================

    std::atomic<float>
        mSampleRate{
            static_cast<float>(
                kDefaultSampleRate
            )
        };

    std::atomic<int32_t>
        mChannelCount{
            kDefaultChannelCount
        };

    // =============================================
    // ENGINE MODES
    // =============================================

    std::atomic<ProcessingMode>
        mProcessingMode{
            ProcessingMode::DSP
        };

    std::atomic<AudioRoute>
        mAudioRoute{
            AudioRoute::Default
        };

    std::atomic<PerformanceMode>
        mPerformanceMode{
            PerformanceMode::LowLatency
        };

    // =============================================
    // OUTPUT
    // =============================================

    std::atomic<bool>
        mExclusiveMode{
            false
        };
};

} // namespace pristine