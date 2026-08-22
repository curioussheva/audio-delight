#include "PCMDecoder.h"

#include <cstring>
#include <algorithm>

namespace pristine::decoder {

// =====================================================
// CTOR / DTOR
// =====================================================

PCMDecoder::PCMDecoder(const DecodeConfig& config)
    : AudioDecoder(config) {}

PCMDecoder::~PCMDecoder() {
    onClose();
}

// =====================================================
// OPEN
// =====================================================

bool PCMDecoder::onOpen(
    const std::string& uri,
    const AudioFormat* /*hint*/
) {
    onClose();

    file_ = std::fopen(
        uri.c_str(),
        "rb"
    );

    if (!file_) {
        return false;
    }

    if (!parseWavHeader()) {
        onClose();
        return false;
    }

    currentFrame_ = 0;

    return true;
}

// =====================================================
// CLOSE
// =====================================================

void PCMDecoder::onClose() {

    if (file_) {
        std::fclose(file_);
        file_ = nullptr;
    }

    currentFrame_ = 0;
    dataOffset_ = 0;
    dataSize_ = 0;
    totalFrames_ = 0;
}

// =====================================================
// DECODE
// =====================================================

DecodeResult PCMDecoder::onDecode(
    uint32_t maxFrames
) {
    DecodeResult result;

    if (!file_) {
        result.status =
            DecodeStatus::FatalError;

        result.errorMessage =
            "PCM file not open";

        return result;
    }

    const uint32_t channels =
        format_.channels;

    const uint32_t bytesPerFrame =
        static_cast<uint32_t>(
            format_.bytesPerFrame());

    std::vector<uint8_t> raw(
        maxFrames * bytesPerFrame);

    const size_t bytesRead =
        std::fread(
            raw.data(),
            1,
            raw.size(),
            file_);

    if (bytesRead == 0) {

        result.status =
            DecodeStatus::EndOfStream;

        return result;
    }

    const uint32_t framesRead =
        static_cast<uint32_t>(
            bytesRead /
            bytesPerFrame);

    result.samples.resize(
        static_cast<size_t>(framesRead) *
        channels);

    convertToFloat(
        raw.data(),
        result.samples.data(),
        result.samples.size());

    result.status =
        DecodeStatus::Success;

    result.framesDecoded =
        framesRead;

    result.framePosition =
        currentFrame_;

    currentFrame_ +=
        framesRead;

    return result;
}

// =====================================================
// SEEK
// =====================================================

bool PCMDecoder::onSeek(
    double positionSeconds
) {
    if (!file_) {
        return false;
    }

    uint64_t frame =
        static_cast<uint64_t>(
            positionSeconds *
            format_.sampleRate);

    return onSeekToFrame(frame);
}

bool PCMDecoder::onSeekToFrame(
    uint64_t frame
) {
    if (!file_) {
        return false;
    }

    frame =
        std::min(
            frame,
            totalFrames_);

    const uint64_t offset =
        dataOffset_ +
        frame *
        format_.bytesPerFrame();

    if (std::fseek(
            file_,
            static_cast<long>(offset),
            SEEK_SET) != 0) {
        return false;
    }

    currentFrame_ = frame;

    return true;
}

// =====================================================
// SEEKABLE / POSITION
// =====================================================

bool PCMDecoder::isSeekable() const {
    return true;
}

double PCMDecoder::getPositionSeconds() const {
    if (format_.sampleRate == 0) {
        return 0.0;
    }
    return static_cast<double>(currentFrame_) / format_.sampleRate;
}

uint64_t PCMDecoder::getPositionFrames() const {
    return currentFrame_;
}

// =====================================================
// INFO
// =====================================================

AudioFormat PCMDecoder::onGetInputFormat() const {
    return format_;
}

DecoderCapabilities
PCMDecoder::getCapabilities() const {

    DecoderCapabilities caps;

    caps.supportsSeeking = true;
    caps.supportsGapless = true;

    caps.supportedFormats = {
        "wav",
        "aiff",
        "pcm"
    };

    return caps;
}

double PCMDecoder::getDurationSeconds() const {

    if (format_.sampleRate == 0) {
        return 0.0;
    }

    return static_cast<double>(
        totalFrames_) /
        format_.sampleRate;
}

// =====================================================
// WAV PARSER
// =====================================================

bool PCMDecoder::parseWavHeader() {

    WavHeader header{};

    if (std::fread(
            &header,
            sizeof(header),
            1,
            file_) != 1) {
        return false;
    }

    if (std::memcmp(
            header.riff,
            "RIFF",
            4) != 0) {
        return false;
    }

    if (std::memcmp(
            header.wave,
            "WAVE",
            4) != 0) {
        return false;
    }

    format_.sampleRate =
        header.sampleRate;

    format_.channels =
        header.channels;

    bitsPerSample_ =
        header.bitsPerSample;

    switch (header.bitsPerSample) {

        case 16:
            format_.sampleFormat =
                SampleFormat::S16;
            break;

        case 24:
            format_.sampleFormat =
                SampleFormat::S24;
            break;

        case 32:
            format_.sampleFormat =
                SampleFormat::S32;
            break;

        default:
            return false;
    }

    char chunkId[4];
    uint32_t chunkSize;

    while (std::fread(
               chunkId,
               1,
               4,
               file_) == 4 &&
           std::fread(
               &chunkSize,
               4,
               1,
               file_) == 1) {

        if (std::memcmp(
                chunkId,
                "data",
                4) == 0) {

            dataOffset_ =
                std::ftell(file_);

            dataSize_ =
                chunkSize;

            break;
        }

        std::fseek(
            file_,
            chunkSize,
            SEEK_CUR);
    }

    if (dataSize_ == 0) {
        return false;
    }

    totalFrames_ =
        dataSize_ /
        format_.bytesPerFrame();

    format_.totalFrames =
        totalFrames_;

    format_.durationSeconds =
        getDurationSeconds();

    return true;
}

// =====================================================
// PCM -> FLOAT
// =====================================================

void PCMDecoder::convertToFloat(
    const uint8_t* input,
    float* output,
    size_t sampleCount
) {
    switch (bitsPerSample_) {

        case 16: {

            auto pcm =
                reinterpret_cast<
                    const int16_t*>(
                    input);

            for (size_t i = 0;
                 i < sampleCount;
                 ++i) {

                output[i] =
                    static_cast<float>(
                        pcm[i]) /
                    32768.0f;
            }

            break;
        }

        case 24: {

            for (size_t i = 0;
                 i < sampleCount;
                 ++i) {

                const uint8_t* p =
                    input + (i * 3);

                int32_t sample =
                    (p[0]) |
                    (p[1] << 8) |
                    (p[2] << 16);

                if (sample & 0x800000) {
                    sample |= ~0xFFFFFF;
                }

                output[i] =
                    static_cast<float>(
                        sample) /
                    8388608.0f;
            }

            break;
        }

        case 32: {

            auto pcm =
                reinterpret_cast<
                    const int32_t*>(
                    input);

            for (size_t i = 0;
                 i < sampleCount;
                 ++i) {

                output[i] =
                    static_cast<float>(
                        pcm[i]) /
                    2147483648.0f;
            }

            break;
        }

        default:
            break;
    }
}

uint64_t PCMDecoder::currentByteOffset() const noexcept {

    return dataOffset_ +
           currentFrame_ *
           format_.bytesPerFrame();
}

} // namespace pristine::decoder 