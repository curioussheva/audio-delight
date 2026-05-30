// =====================================================
// core/AudioMetrics.h
// =====================================================

#pragma once

#include <atomic>
#include <cstdint>

#include "EngineStats.h"

namespace pristine {

// =====================================================
// REALTIME AUDIO METRICS
// Thread-safe statistics collector
// =====================================================

class AudioMetrics {
public:

    // =============================================
    // XRUNS
    // =============================================

    inline void
    recordUnderrun() noexcept {

        mUnderruns.fetch_add(
            1,
            std::memory_order_relaxed
        );
    }

    inline void
    recordOverrun() noexcept {

        mOverruns.fetch_add(
            1,
            std::memory_order_relaxed
        );
    }

    // =============================================
    // LATENCY
    // =============================================

    inline void
    updateLatencyMs(
        float ms
    ) noexcept {

        mLatencyMs.store(
            ms,
            std::memory_order_relaxed
        );
    }

    // =============================================
    // BUFFER
    // =============================================

    inline void
    updateBufferedSamples(
        uint64_t samples
    ) noexcept {

        mBufferedSamples.store(
            samples,
            std::memory_order_relaxed
        );
    }

    // =============================================
    // CALLBACK TIME
    // =============================================

    inline void
    updateCallbackTimeMs(
        float ms
    ) noexcept {

        mCallbackTimeMs.store(
            ms,
            std::memory_order_relaxed
        );
    }

    // =============================================
    // CPU LOAD
    // =============================================

    inline void
    updateCpuLoad(
        float load
    ) noexcept {

        mCpuLoad.store(
            load,
            std::memory_order_relaxed
        );
    }

    // =============================================
    // STREAM INFO
    // =============================================

    inline void
    updateSampleRate(
        uint32_t sampleRate
    ) noexcept {

        mSampleRate.store(
            sampleRate,
            std::memory_order_relaxed
        );
    }

    inline void
    updateChannelCount(
        uint32_t channels
    ) noexcept {

        mChannelCount.store(
            channels,
            std::memory_order_relaxed
        );
    }

    // =============================================
    // FLAGS
    // =============================================

    inline void
    setExclusiveMode(
        bool enabled
    ) noexcept {

        mExclusiveMode.store(
            enabled,
            std::memory_order_relaxed
        );
    }

    inline void
    setDSPEnabled(
        bool enabled
    ) noexcept {

        mDSPEnabled.store(
            enabled,
            std::memory_order_relaxed
        );
    }

    // =============================================
    // SNAPSHOT
    // =============================================

    EngineStats
    getStats() const noexcept;

    // =============================================
    // RESET
    // =============================================

    void reset() noexcept;

private:

    // =============================================
    // BUFFER
    // =============================================

    std::atomic<uint64_t>
        mBufferedSamples{0};

    // =============================================
    // XRUNS
    // =============================================

    std::atomic<uint64_t>
        mUnderruns{0};

    std::atomic<uint64_t>
        mOverruns{0};

    // =============================================
    // LATENCY
    // =============================================

    std::atomic<float>
        mLatencyMs{0.0f};

    // =============================================
    // CALLBACK
    // =============================================

    std::atomic<float>
        mCallbackTimeMs{0.0f};

    // =============================================
    // CPU
    // =============================================

    std::atomic<float>
        mCpuLoad{0.0f};

    // =============================================
    // STREAM
    // =============================================

    std::atomic<uint32_t>
        mSampleRate{48000};

    std::atomic<uint32_t>
        mChannelCount{2};

    // =============================================
    // FLAGS
    // =============================================

    std::atomic<bool>
        mExclusiveMode{false};

    std::atomic<bool>
        mDSPEnabled{true};
};

} // namespace pristine