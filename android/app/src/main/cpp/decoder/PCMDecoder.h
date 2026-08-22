#pragma once

#include "AudioDecoder.h"
#include <cstdio>
#include <vector>

namespace pristine::decoder {

// =====================================================
// PCM DECODER (WAV, AIFF, RAW PCM)
// =====================================================
 
class PCMDecoder : public AudioDecoder {
public:
    explicit PCMDecoder(const DecodeConfig& config = {});
    ~PCMDecoder() override;

protected:
    bool onOpen(const std::string& uri, const AudioFormat* hint) override;
    void onClose() override;
    DecodeResult onDecode(uint32_t maxFrames) override;
    bool onSeek(double positionSeconds) override;
    bool onSeekToFrame(uint64_t frame) override;

    AudioFormat onGetInputFormat() const override;

    bool isSeekable() const override;
    DecoderCapabilities getCapabilities() const override;
    double getPositionSeconds() const override;
    uint64_t getPositionFrames() const override;
    double getDurationSeconds() const override;

private:
    struct WavHeader {
        char riff[4];
        uint32_t fileSize;
        char wave[4];
        char fmt[4];
        uint32_t fmtSize;
        uint16_t audioFormat;
        uint16_t channels;
        uint32_t sampleRate;
        uint32_t byteRate;
        uint16_t blockAlign;
        uint16_t bitsPerSample;
    };

    std::FILE* file_ = nullptr;

    AudioFormat format_;
    uint16_t bitsPerSample_ = 0;

    uint64_t dataOffset_ = 0;
    uint64_t dataSize_ = 0;
    uint64_t currentFrame_ = 0;
    uint64_t totalFrames_ = 0;

    bool parseWavHeader();

    void convertToFloat(
        const uint8_t* input,
        float* output,
        size_t sampleCount);

    [[nodiscard]]
    uint64_t currentByteOffset() const noexcept;
};

} // namespace pristine::decoder
 