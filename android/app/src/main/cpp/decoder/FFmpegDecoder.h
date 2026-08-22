#pragma once

#include "AudioDecoder.h"

struct AVFormatContext;
struct AVCodecContext;
struct AVFrame;
struct AVPacket;
struct SwrContext;

namespace pristine::decoder {

// =====================================================
// FFMPEG DECODER
// =====================================================

class FFmpegDecoder final : public AudioDecoder {
public:
    explicit FFmpegDecoder(const DecodeConfig& config = {});
    ~FFmpegDecoder() override;

    FFmpegDecoder(const FFmpegDecoder&) = delete;
    FFmpegDecoder& operator=(const FFmpegDecoder&) = delete;

protected:

    // =========================================
    // AudioDecoder
    // =========================================

    bool onOpen(
        const std::string& uri,
        const AudioFormat* hint
    ) override;

    void onClose() override;

    DecodeResult onDecode(
        uint32_t maxFrames
    ) override;

    bool onSeek(
        double positionSeconds
    ) override;

    bool onSeekToFrame(
        uint64_t frame
    ) override;

    AudioFormat onGetInputFormat() const override;

    DecoderCapabilities
    getCapabilities() const override;

    // =========================================
    // Position
    // =========================================

    double
    getPositionSeconds() const override;

    uint64_t
    getPositionFrames() const override;

    double
    getDurationSeconds() const override;

    // =========================================
    // Capabilities
    // =========================================

    bool isSeekable() const override;

private:

    bool setupCodec();
    bool setupResampler();
    void cleanup();

    DecodeResult decodeFrame();

    static SampleFormat
    convertSampleFormat(
        int ffmpegFormat
    );

private:

    AVFormatContext* formatCtx_ = nullptr;
    AVCodecContext* codecCtx_ = nullptr;
    AVFrame* frame_ = nullptr;
    AVPacket* packet_ = nullptr;
    SwrContext* swrCtx_ = nullptr;

    int audioStreamIndex_ = -1;

    AudioFormat inputFormat_;

    uint64_t currentFrame_ = 0;
    uint64_t durationFrames_ = 0;

    std::vector<uint8_t> packetBuffer_;
};

} // namespace pristine::decoder 