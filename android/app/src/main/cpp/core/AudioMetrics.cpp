// =====================================================
// core/AudioMetrics.cpp
// =====================================================

#include "AudioMetrics.h"

namespace pristine {

// =====================================================
// GET STATS SNAPSHOT
// =====================================================

EngineStats
AudioMetrics::getStats() const noexcept {

    EngineStats stats;

    stats.bufferedSamples =
        mBufferedSamples.load(
            std::memory_order_relaxed
        );

    stats.underruns =
        mUnderruns.load(
            std::memory_order_relaxed
        );

    stats.overruns =
        mOverruns.load(
            std::memory_order_relaxed
        );

    stats.latencyMs =
        mLatencyMs.load(
            std::memory_order_relaxed
        );

    stats.callbackTimeMs =
        mCallbackTimeMs.load(
            std::memory_order_relaxed
        );

    stats.cpuLoad =
        mCpuLoad.load(
            std::memory_order_relaxed
        );

    stats.sampleRate =
        mSampleRate.load(
            std::memory_order_relaxed
        );

    stats.channelCount =
        mChannelCount.load(
            std::memory_order_relaxed
        );

    stats.exclusiveMode =
        mExclusiveMode.load(
            std::memory_order_relaxed
        );

    stats.dspEnabled =
        mDSPEnabled.load(
            std::memory_order_relaxed
        );

    return stats;
}

// =====================================================
// RESET
// =====================================================

void AudioMetrics::reset() noexcept {

    mBufferedSamples.store(
        0,
        std::memory_order_relaxed
    );

    mUnderruns.store(
        0,
        std::memory_order_relaxed
    );

    mOverruns.store(
        0,
        std::memory_order_relaxed
    );

    mLatencyMs.store(
        0.0f,
        std::memory_order_relaxed
    );

    mCallbackTimeMs.store(
        0.0f,
        std::memory_order_relaxed
    );

    mCpuLoad.store(
        0.0f,
        std::memory_order_relaxed
    );
}

} // namespace pristine