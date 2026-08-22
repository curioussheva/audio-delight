#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace pristine::decoder {

// =====================================================
// AUDIO FORMAT
// =====================================================

enum class SampleFormat {
    Unknown,

    U8,

    S16,
    S24,
    S24P32,
    S32,

    F32,
    F64
};

enum class ChannelLayout {
    Unknown,

    Mono,
    Stereo,

    Surround5_1,
    Surround7_1
};

struct AudioFormat {

    uint32_t sampleRate = 48000;

    uint32_t channels = 2;

    SampleFormat sampleFormat =
        SampleFormat::F32;

    ChannelLayout channelLayout =
        ChannelLayout::Stereo;

    uint64_t totalFrames = 0;

    uint64_t bitrate = 0;

    double durationSeconds = 0.0;

    [[nodiscard]]
    bool isValid() const noexcept {
        return sampleRate > 0 &&
               channels > 0;
    }

    [[nodiscard]]
    size_t bytesPerSample() const noexcept {

        switch (sampleFormat) {

            case SampleFormat::U8:
                return 1;

            case SampleFormat::S16:
                return 2;

            case SampleFormat::S24:
                return 3;

            case SampleFormat::S24P32:
                return 4;

            case SampleFormat::S32:
                return 4;

            case SampleFormat::F32:
                return 4;

            case SampleFormat::F64:
                return 8;

            default:
                return 0;
        }
    }

    [[nodiscard]]
    size_t bytesPerFrame() const noexcept {
        return channels *
               bytesPerSample();
    }
};

// =====================================================
// METADATA
// =====================================================

struct AudioMetadata {

    std::string title;

    std::string artist;

    std::string album;

    std::string albumArtist;

    std::string genre;

    std::string composer;

    uint32_t trackNumber = 0;

    uint32_t discNumber = 0;

    uint32_t year = 0;

    std::string artworkUri;
};

// =====================================================
// DECODER CAPABILITIES
// =====================================================

struct DecoderCapabilities {

    bool supportsSeeking = true;

    bool supportsStreaming = true;

    bool supportsGapless = false;

    bool supportsMetadata = true;

    bool supportsEmbeddedArtwork = false;

    uint32_t maxChannels = 8;

    uint32_t maxSampleRate = 192000;

    std::vector<std::string>
        supportedFormats;
};

// =====================================================
// DECODE CONFIG
// =====================================================

struct DecodeConfig {

    uint32_t targetSampleRate =
        48000;

    uint32_t targetChannels =
        2;

    uint32_t chunkFrames =
        4096;

    uint32_t readAheadChunks =
        4;

    bool fastSeek =
        false;

    uint32_t maxConsecutiveErrors =
        3;

    bool continueOnError =
        false;
};

// =====================================================
// DECODE STATUS
// =====================================================

enum class DecodeStatus {

    Success,

    EndOfStream,

    NeedMoreData,

    Error,

    FatalError,

    NotSupported
};

// =====================================================
// DECODE RESULT
// =====================================================

struct DecodeResult {

    DecodeStatus status =
        DecodeStatus::Success;

    std::vector<float> samples;

    uint32_t framesDecoded =
        0;

    uint64_t framePosition =
        0;

    std::string errorMessage;

    DecodeResult() = default;

    DecodeResult(
        DecodeResult&&
    ) noexcept = default;

    DecodeResult&
    operator=(
        DecodeResult&&
    ) noexcept = default;

    DecodeResult(
        const DecodeResult&
    ) = delete;

    DecodeResult&
    operator=(
        const DecodeResult&
    ) = delete;

    [[nodiscard]]
    bool isSuccess() const noexcept {

        return status ==
                   DecodeStatus::Success &&
               !samples.empty();
    }

    [[nodiscard]]
    bool isEof() const noexcept {

        return status ==
               DecodeStatus::EndOfStream;
    }
};

struct PCMView {
    float* data = nullptr;
    int32_t frames = 0;
    int32_t channels = 2;
    bool interleaved = true;
};

struct DecodedChunk {
    PCMView pcm;
    int64_t pts = -1;
    bool endOfStream = false;
    bool discontinuity = false;
};

// =====================================================
// SEEK
// =====================================================

enum class SeekMode {
    Time,
    Frame
};

struct SeekRequest {

    SeekMode mode =
        SeekMode::Time;

    double targetSeconds =
        0.0;

    uint64_t targetFrame =
        0;

    bool fast =
        false;
};

// =====================================================
// STREAM INFO
// =====================================================

struct StreamInfo {

    std::string url;

    std::vector<
        std::pair<
            std::string,
            std::string
        >
    > headers;

    int64_t contentLength =
        -1;

    bool isLive =
        false;

    double bufferDuration =
        0.0;
};

} // namespace pristine::decoder 