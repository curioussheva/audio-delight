#pragma once

#include <cstddef>
#include <cstdint>

namespace pristine {

// =====================================================
// AUDIO FORMAT
// =====================================================

enum class AudioFormat {
    PCM_F32,
    PCM_S16,
    PCM_S24,
    PCM_S32,
    UNKNOWN
};

// =====================================================
// SAMPLE LAYOUT
// =====================================================

enum class SampleLayout {
    Interleaved,
    Planar
};

// =====================================================
// CHANNEL LAYOUT
// =====================================================

enum class ChannelLayout {
    Mono,
    Stereo,
    Surround51,
    Surround71,
    Unknown
};

// =====================================================
// STREAM INFO
// =====================================================

struct AudioStreamInfo {

    int32_t sampleRate = 0;

    int32_t channels = 0;

    AudioFormat format =
        AudioFormat::UNKNOWN;

    SampleLayout layout =
        SampleLayout::Interleaved;

    ChannelLayout channelLayout =
        ChannelLayout::Stereo;

    int64_t totalFrames = -1;

    double durationSec = 0.0;

    bool seekable = false;

    bool isStreaming = false;
};

// =====================================================
// PCM BUFFER VIEW
// Non-owning realtime-safe descriptor
// =====================================================

struct PCMBufferView {

    float* data = nullptr;

    int32_t frames = 0;

    int32_t channels = 0;

    SampleLayout layout =
        SampleLayout::Interleaved;

    size_t stride = 0;
};

// =====================================================
// DECODED CHUNK
// =====================================================

struct DecodedChunk {

    PCMBufferView pcm;

    double pts = 0.0;

    bool endOfStream = false;

    bool discontinuity = false;
};

} // namespace pristine