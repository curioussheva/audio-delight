#include "FFmpegDecoder.h"

extern "C" {
#include <libavformat/avformat.h>
#include <libavcodec/avcodec.h>
#include <libswresample/swresample.h>
#include <libavutil/channel_layout.h>
#include <libavutil/samplefmt.h>
}

namespace pristine::decoder {

// =====================================================
// CTOR / DTOR
// =====================================================

FFmpegDecoder::FFmpegDecoder() = default;

FFmpegDecoder::~FFmpegDecoder() {
    cleanup();
}

// =====================================================
// OPEN
// =====================================================

bool FFmpegDecoder::onOpen(
    const std::string& uri,
    const AudioFormat* /*hint*/
) {
    cleanup();

    if (avformat_open_input(
            &formatCtx_,
            uri.c_str(),
            nullptr,
            nullptr) < 0) {
        return false;
    }

    if (avformat_find_stream_info(
            formatCtx_,
            nullptr) < 0) {
        cleanup();
        return false;
    }

    audioStreamIndex_ =
        av_find_best_stream(
            formatCtx_,
            AVMEDIA_TYPE_AUDIO,
            -1,
            -1,
            nullptr,
            0);

    if (audioStreamIndex_ < 0) {
        cleanup();
        return false;
    }

    if (!setupCodec()) {
        cleanup();
        return false;
    }

    if (!setupResampler()) {
        cleanup();
        return false;
    }

    frame_ = av_frame_alloc();
    packet_ = av_packet_alloc();

    return frame_ && packet_;
}

// =====================================================
// CLOSE
// =====================================================

void FFmpegDecoder::onClose() {
    cleanup();
}

// =====================================================
// DECODE
// =====================================================

DecodeResult FFmpegDecoder::onDecode(
    uint32_t maxFrames
) {
    DecodeResult result;

    result.samples.reserve(
        maxFrames *
        codecCtx_->ch_layout.nb_channels);

    while (result.framesDecoded < maxFrames) {

        int readResult =
            av_read_frame(
                formatCtx_,
                packet_);

        if (readResult < 0) {

            result.status =
                DecodeStatus::Eof;

            break;
        }

        if (packet_->stream_index != audioStreamIndex_) {
            av_packet_unref(packet_);
            continue;
        }

        if (avcodec_send_packet(
                codecCtx_,
                packet_) < 0) {
            av_packet_unref(packet_);

            result.status =
                DecodeStatus::Error;

            return result;
        }

        av_packet_unref(packet_);

        while (true) {

            int receiveResult =
                avcodec_receive_frame(
                    codecCtx_,
                    frame_);

            if (receiveResult == AVERROR(EAGAIN))
                break;

            if (receiveResult == AVERROR_EOF) {
                result.status =
                    DecodeStatus::Eof;
                return result;
            }

            if (receiveResult < 0) {
                result.status =
                    DecodeStatus::Error;
                return result;
            }

            const int outSamples =
                swr_get_out_samples(
                    swrCtx_,
                    frame_->nb_samples);

            const int channels =
                codecCtx_->ch_layout.nb_channels;

            std::vector<float> temp(
                outSamples * channels);

            uint8_t* out[] = {
                reinterpret_cast<uint8_t*>(
                    temp.data())
            };

            int converted =
                swr_convert(
                    swrCtx_,
                    out,
                    outSamples,
                    const_cast<const uint8_t**>(
                        frame_->extended_data),
                    frame_->nb_samples);

            if (converted > 0) {

                temp.resize(
                    converted *
                    channels);

                result.samples.insert(
                    result.samples.end(),
                    temp.begin(),
                    temp.end());

                result.framesDecoded +=
                    converted;

                currentFrame_ +=
                    converted;
            }

            if (result.framesDecoded >= maxFrames)
                break;
        }

        if (result.framesDecoded >= maxFrames)
            break;
    }

    result.status =
        result.framesDecoded > 0
            ? DecodeStatus::Success
            : DecodeStatus::Eof;

    result.framePosition =
        currentFrame_;

    return result;
}

// =====================================================
// SEEK
// =====================================================

bool FFmpegDecoder::onSeek(
    double positionSeconds
) {
    if (!formatCtx_)
        return false;

    int64_t timestamp =
        static_cast<int64_t>(
            positionSeconds *
            AV_TIME_BASE);

    if (av_seek_frame(
            formatCtx_,
            -1,
            timestamp,
            AVSEEK_FLAG_BACKWARD) < 0) {
        return false;
    }

    avcodec_flush_buffers(
        codecCtx_);

    currentFrame_ =
        static_cast<uint64_t>(
            positionSeconds *
            codecCtx_->sample_rate);

    return true;
}

bool FFmpegDecoder::onSeekToFrame(
    uint64_t frame
) {
    return onSeek(
        static_cast<double>(frame) /
        codecCtx_->sample_rate);
}

// =====================================================
// FORMAT INFO
// =====================================================

AudioFormat FFmpegDecoder::onGetInputFormat() const {

    AudioFormat format;

    if (!codecCtx_)
        return format;

    format.sampleRate =
        codecCtx_->sample_rate;

    format.channels =
        codecCtx_->ch_layout.nb_channels;

    format.bitsPerSample =
        32;

    format.sampleFormat =
        AudioFormat::SampleFormat::F32;

    format.durationSeconds =
        onGetDuration();

    return format;
}

DecoderCapabilities FFmpegDecoder::onGetCapabilities() const {

    DecoderCapabilities caps;

    caps.supportsSeeking = true;
    caps.supportsGapless = true;

    caps.supportedFormats = {
        "mp3",
        "aac",
        "m4a",
        "flac",
        "wav",
        "ogg",
        "opus"
    };

    return caps;
}

double FFmpegDecoder::onGetDuration() const {

    if (!formatCtx_)
        return 0.0;

    return static_cast<double>(
        formatCtx_->duration) /
        AV_TIME_BASE;
}

// =====================================================
// INTERNAL
// =====================================================

bool FFmpegDecoder::setupCodec() {

    AVStream* stream =
        formatCtx_->streams[audioStreamIndex_];

    const AVCodec* codec =
        avcodec_find_decoder(
            stream->codecpar->codec_id);

    if (!codec)
        return false;

    codecCtx_ =
        avcodec_alloc_context3(codec);

    if (!codecCtx_)
        return false;

    if (avcodec_parameters_to_context(
            codecCtx_,
            stream->codecpar) < 0) {
        return false;
    }

    return avcodec_open2(
               codecCtx_,
               codec,
               nullptr) >= 0;
}

bool FFmpegDecoder::setupResampler() {

    swrCtx_ =
        swr_alloc();

    if (!swrCtx_)
        return false;

    AVChannelLayout stereo;
    av_channel_layout_default(
        &stereo,
        2);

    swr_alloc_set_opts2(
        &swrCtx_,
        &stereo,
        AV_SAMPLE_FMT_FLT,
        codecCtx_->sample_rate,
        &codecCtx_->ch_layout,
        codecCtx_->sample_fmt,
        codecCtx_->sample_rate,
        0,
        nullptr);

    return swr_init(
               swrCtx_) >= 0;
}

void FFmpegDecoder::cleanup() {

    if (packet_) {
        av_packet_free(&packet_);
    }

    if (frame_) {
        av_frame_free(&frame_);
    }

    if (codecCtx_) {
        avcodec_free_context(
            &codecCtx_);
    }

    if (swrCtx_) {
        swr_free(&swrCtx_);
    }

    if (formatCtx_) {
        avformat_close_input(
            &formatCtx_);
    }

    audioStreamIndex_ = -1;
    currentFrame_ = 0;
}

// =====================================================
// HELPERS
// =====================================================

AudioFormat::SampleFormat
FFmpegDecoder::convertSampleFormat(
    int ffFormat
) {
    switch (ffFormat) {
        case AV_SAMPLE_FMT_U8:
            return AudioFormat::SampleFormat::U8;

        case AV_SAMPLE_FMT_S16:
            return AudioFormat::SampleFormat::S16;

        case AV_SAMPLE_FMT_S32:
            return AudioFormat::SampleFormat::S32;

        case AV_SAMPLE_FMT_FLT:
            return AudioFormat::SampleFormat::F32;

        case AV_SAMPLE_FMT_DBL:
            return AudioFormat::SampleFormat::F64;

        default:
            return AudioFormat::SampleFormat::Unknown;
    }
}

int64_t FFmpegDecoder::getChannelLayout(
    int channels
) {
    AVChannelLayout layout;
    av_channel_layout_default(
        &layout,
        channels);

    return layout.u.mask;
}

} // namespace pristine::decoder 