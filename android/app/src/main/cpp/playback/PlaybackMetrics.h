#pragma once

#include <atomic>
#include <cstdint>
#include <chrono>

namespace pristine::playback {

// =====================================================
// IMMUTABLE METRICS SNAPSHOT
// =====================================================

struct PlaybackMetrics {

    // =====================================
    // Session Timing
    // =====================================

    uint64_t sessionElapsedMs = 0;

    uint64_t trackElapsedMs = 0;

    // =====================================
    // Counters
    // =====================================

    uint64_t totalFramesRendered = 0;

    uint64_t totalFramesDecoded = 0;

    uint64_t underrunCount = 0;

    uint64_t overrunCount = 0;

    uint64_t xrunCount = 0;

    // =====================================
    // Queue
    // =====================================

    uint32_t queueFillPercent = 0;

    uint32_t queueFramesAvailable = 0;

    // =====================================
    // Latency
    // =====================================

    float averageDecodeLatencyUs = 0.0f;

    float averageRenderLatencyUs = 0.0f;

    float currentBufferDepthMs = 0.0f;

    // =====================================
    // Audio Format
    // =====================================

    uint32_t currentSampleRate = 0;

    uint16_t currentChannels = 0;

    uint16_t currentBitDepth = 0;

    // =====================================
    // Performance
    // =====================================

    float dspLoadPercent = 0.0f;

    float cpuUsagePercent = 0.0f;
};

// =====================================================
// THREAD-SAFE METRICS COLLECTOR
// =====================================================
//
// Write:
//   Audio Thread
//   Decoder Thread
//
// Read:
//   UI Thread
//   JNI Thread
//
// No locks on hot path.
// =====================================================

class MetricsCollector {
public:

    MetricsCollector();

    ~MetricsCollector() = default;

    MetricsCollector(
        const MetricsCollector&
    ) = delete;

    MetricsCollector& operator=(
        const MetricsCollector&
    ) = delete;

    // =====================================
    // Counters
    // =====================================

    void recordFrameRendered(
        uint32_t frameCount
    ) noexcept;

    void recordFrameDecoded(
        uint32_t frameCount
    ) noexcept;

    void recordUnderrun() noexcept;

    void recordOverrun() noexcept;

    // =====================================
    // Latency
    // =====================================

    void recordDecodeLatency(
        float microseconds
    ) noexcept;

    void recordRenderLatency(
        float microseconds
    ) noexcept;

    // =====================================
    // Queue
    // =====================================

    void updateBufferDepth(
        float milliseconds
    ) noexcept;

    void updateQueueFill(
        uint32_t percent
    ) noexcept;

    void updateQueueFrames(
        uint32_t frames
    ) noexcept;

    // =====================================
    // Performance
    // =====================================

    void updateDSPLoad(
        float percent
    ) noexcept;

    void updateCPUUsage(
        float percent
    ) noexcept;

    // =====================================
    // Audio Format
    // =====================================

    void setAudioFormat(
        uint32_t sampleRate,
        uint16_t channels,
        uint16_t bitDepth
    ) noexcept;

    // =====================================
    // Session Control
    // =====================================

    void startSession() noexcept;

    void startTrack() noexcept;

    void reset() noexcept;

    // =====================================
    // Snapshot
    // =====================================

    [[nodiscard]]
    PlaybackMetrics
    snapshot() const noexcept;

private:

    static constexpr float
        kEmaAlpha = 0.1f;

private:

    // =====================================
    // Session Timing
    // =====================================

    std::chrono::steady_clock::time_point
        sessionStart_;

    std::chrono::steady_clock::time_point
        trackStart_;

    // =====================================
    // Counters
    // =====================================

    std::atomic<uint64_t>
        framesRendered_{0};

    std::atomic<uint64_t>
        framesDecoded_{0};

    std::atomic<uint64_t>
        underruns_{0};

    std::atomic<uint64_t>
        overruns_{0};

    // =====================================
    // Queue
    // =====================================

    std::atomic<uint32_t>
        queueFillPercent_{0};

    std::atomic<uint32_t>
        queueFramesAvailable_{0};

    std::atomic<float>
        bufferDepthMs_{0.0f};

    // =====================================
    // Latency EMA
    // =====================================

    //
    // Updated only by audio/decode thread.
    // Read by UI thread.
    //

    std::atomic<float>
        decodeLatencyUs_{0.0f};

    std::atomic<float>
        renderLatencyUs_{0.0f};

    // =====================================
    // Audio Format
    // =====================================

    std::atomic<uint32_t>
        sampleRate_{0};

    std::atomic<uint16_t>
        channels_{0};

    std::atomic<uint16_t>
        bitDepth_{0};

    // =====================================
    // Performance
    // =====================================

    std::atomic<float>
        dspLoadPercent_{0.0f};

    std::atomic<float>
        cpuUsagePercent_{0.0f};
};

} // namespace pristine::playback 