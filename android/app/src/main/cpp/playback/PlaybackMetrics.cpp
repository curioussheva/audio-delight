// =====================================================
// playback/PlaybackMetrics.cpp
// =====================================================

#include "PlaybackMetrics.h"

namespace pristine::playback {

// =====================================================
// CONSTRUCTOR
// =====================================================

MetricsCollector::MetricsCollector()
    : sessionStart_(std::chrono::steady_clock::now()),
      trackStart_(std::chrono::steady_clock::now()) {
}

// =====================================================
// COUNTERS
// =====================================================

void MetricsCollector::recordFrameRendered(
    uint32_t frameCount
) noexcept {
    framesRendered_.fetch_add(
        frameCount,
        std::memory_order_relaxed
    );
}

void MetricsCollector::recordFrameDecoded(
    uint32_t frameCount
) noexcept {
    framesDecoded_.fetch_add(
        frameCount,
        std::memory_order_relaxed
    );
}

void MetricsCollector::recordUnderrun() noexcept {
    underruns_.fetch_add(
        1,
        std::memory_order_relaxed
    );
}

void MetricsCollector::recordOverrun() noexcept {
    overruns_.fetch_add(
        1,
        std::memory_order_relaxed
    );
}

// =====================================================
// LATENCY (EMA)
// =====================================================

void MetricsCollector::recordDecodeLatency(
    float microseconds
) noexcept {
    const float previous =
        decodeLatencyUs_.load(
            std::memory_order_relaxed
        );

    const float updated =
        previous +
        kEmaAlpha *
            (microseconds - previous);

    decodeLatencyUs_.store(
        updated,
        std::memory_order_relaxed
    );
}

void MetricsCollector::recordRenderLatency(
    float microseconds
) noexcept {
    const float previous =
        renderLatencyUs_.load(
            std::memory_order_relaxed
        );

    const float updated =
        previous +
        kEmaAlpha *
            (microseconds - previous);

    renderLatencyUs_.store(
        updated,
        std::memory_order_relaxed
    );
}

// =====================================================
// QUEUE
// =====================================================

void MetricsCollector::updateBufferDepth(
    float milliseconds
) noexcept {
    bufferDepthMs_.store(
        milliseconds,
        std::memory_order_relaxed
    );
}

void MetricsCollector::updateQueueFill(
    uint32_t percent
) noexcept {
    queueFillPercent_.store(
        percent,
        std::memory_order_relaxed
    );
}

void MetricsCollector::updateQueueFrames(
    uint32_t frames
) noexcept {
    queueFramesAvailable_.store(
        frames,
        std::memory_order_relaxed
    );
}

// =====================================================
// PERFORMANCE
// =====================================================

void MetricsCollector::updateDSPLoad(
    float percent
) noexcept {
    dspLoadPercent_.store(
        percent,
        std::memory_order_relaxed
    );
}

void MetricsCollector::updateCPUUsage(
    float percent
) noexcept {
    cpuUsagePercent_.store(
        percent,
        std::memory_order_relaxed
    );
}

// =====================================================
// AUDIO FORMAT
// =====================================================

void MetricsCollector::setAudioFormat(
    uint32_t sampleRate,
    uint16_t channels,
    uint16_t bitDepth
) noexcept {
    sampleRate_.store(
        sampleRate,
        std::memory_order_relaxed
    );

    channels_.store(
        channels,
        std::memory_order_relaxed
    );

    bitDepth_.store(
        bitDepth,
        std::memory_order_relaxed
    );
}

// =====================================================
// SESSION CONTROL
// =====================================================

void MetricsCollector::startSession() noexcept {
    sessionStart_ = std::chrono::steady_clock::now();
}

void MetricsCollector::startTrack() noexcept {
    trackStart_ = std::chrono::steady_clock::now();
}

void MetricsCollector::reset() noexcept {
    framesRendered_.store(0, std::memory_order_relaxed);
    framesDecoded_.store(0, std::memory_order_relaxed);
    underruns_.store(0, std::memory_order_relaxed);
    overruns_.store(0, std::memory_order_relaxed);

    queueFillPercent_.store(0, std::memory_order_relaxed);
    queueFramesAvailable_.store(0, std::memory_order_relaxed);
    bufferDepthMs_.store(0.0f, std::memory_order_relaxed);

    decodeLatencyUs_.store(0.0f, std::memory_order_relaxed);
    renderLatencyUs_.store(0.0f, std::memory_order_relaxed);

    dspLoadPercent_.store(0.0f, std::memory_order_relaxed);
    cpuUsagePercent_.store(0.0f, std::memory_order_relaxed);

    sessionStart_ = std::chrono::steady_clock::now();
    trackStart_ = std::chrono::steady_clock::now();
}

// =====================================================
// SNAPSHOT
// =====================================================

PlaybackMetrics
MetricsCollector::snapshot() const noexcept {
    PlaybackMetrics metrics;

    const auto now =
        std::chrono::steady_clock::now();

    metrics.sessionElapsedMs =
        static_cast<uint64_t>(
            std::chrono::duration_cast<std::chrono::milliseconds>(
                now - sessionStart_
            ).count()
        );

    metrics.trackElapsedMs =
        static_cast<uint64_t>(
            std::chrono::duration_cast<std::chrono::milliseconds>(
                now - trackStart_
            ).count()
        );

    metrics.totalFramesRendered =
        framesRendered_.load(std::memory_order_relaxed);

    metrics.totalFramesDecoded =
        framesDecoded_.load(std::memory_order_relaxed);

    metrics.underrunCount =
        underruns_.load(std::memory_order_relaxed);

    metrics.overrunCount =
        overruns_.load(std::memory_order_relaxed);

    metrics.xrunCount =
        metrics.underrunCount + metrics.overrunCount;

    metrics.queueFillPercent =
        queueFillPercent_.load(std::memory_order_relaxed);

    metrics.queueFramesAvailable =
        queueFramesAvailable_.load(std::memory_order_relaxed);

    metrics.averageDecodeLatencyUs =
        decodeLatencyUs_.load(std::memory_order_relaxed);

    metrics.averageRenderLatencyUs =
        renderLatencyUs_.load(std::memory_order_relaxed);

    metrics.currentBufferDepthMs =
        bufferDepthMs_.load(std::memory_order_relaxed);

    metrics.currentSampleRate =
        sampleRate_.load(std::memory_order_relaxed);

    metrics.currentChannels =
        channels_.load(std::memory_order_relaxed);

    metrics.currentBitDepth =
        bitDepth_.load(std::memory_order_relaxed);

    metrics.dspLoadPercent =
        dspLoadPercent_.load(std::memory_order_relaxed);

    metrics.cpuUsagePercent =
        cpuUsagePercent_.load(std::memory_order_relaxed);

    return metrics;
}

} // namespace pristine::playback