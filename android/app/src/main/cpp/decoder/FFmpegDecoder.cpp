#include "FFmpegDecoder.h"

extern "C" {
#include <libavformat/avformat.h>
#include <libavcodec/avcodec.h>
#include <libswresample/swresample.h>
#include <libavutil/channel_layout.h>
#include <libavutil/samplefmt.h>
#include <libavutil/opt.h>
}

#include <android/log.h>
#include <cmath>

namespace pristine::decoder {

// =====================================================
// CTOR / DTOR
// =====================================================

FFmpegDecoder::FFmpegDecoder(const DecodeConfig& config)
    : AudioDecoder(config) {}

FFmpegDecoder::~FFmpegDecoder() {
    cleanup();
}

// =====================================================
// OPEN
// =====================================================

bool FFmpegDecoder::onOpen(
    const std::string& uri,
    const AudioFormat* /*hint*/) {

    cleanup();

    __android_log_print(ANDROID_LOG_DEBUG, "FFmpegDecoder",
                        "onOpen: %s", uri.c_str());

    if (avformat_open_input(
            &formatCtx_,
            uri.c_str(),
            nullptr,
            nullptr) < 0) {
        __android_log_print(ANDROID_LOG_ERROR, "FFmpegDecoder",
                            "onOpen: avformat_open_input failed");
        return false;
    }

    if (avformat_find_stream_info(
            formatCtx_,
            nullptr) < 0) {
        __android_log_print(ANDROID_LOG_ERROR, "FFmpegDecoder",
                            "onOpen: avformat_find_stream_info failed");
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
        __android_log_print(ANDROID_LOG_ERROR, "FFmpegDecoder",
                            "onOpen: no audio stream found");
        cleanup();
        return false;
    }

    if (!setupCodec()) {
        __android_log_print(ANDROID_LOG_ERROR, "FFmpegDecoder",
                            "onOpen: setupCodec failed");
        cleanup();
        return false;
    }

    if (!setupResampler()) {
        __android_log_print(ANDROID_LOG_ERROR, "FFmpegDecoder",
                            "onOpen: setupResampler failed");
        cleanup();
        return false;
    }

    frame_ = av_frame_alloc();
    packet_ = av_packet_alloc();

    if (!frame_ || !packet_) {
        cleanup();
        return false;
    }

    __android_log_print(ANDROID_LOG_DEBUG, "FFmpegDecoder",
                        "onOpen: success");
    return true;
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
    uint32_t maxFrames) {

    DecodeResult result;
    result.samples.reserve(
        maxFrames * 2); // asumsi stereo

    while (result.framesDecoded < maxFrames) {

        int readResult = av_read_frame(
            formatCtx_,
            packet_);

        if (readResult < 0) {
            // EOF atau error
            result.status = DecodeStatus::EndOfStream;
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
            result.status = DecodeStatus::Error;
            return result;
        }

        av_packet_unref(packet_);

        while (true) {
            int receiveResult = avcodec_receive_frame(
                codecCtx_,
                frame_);

            if (receiveResult == AVERROR(EAGAIN))
                break;

            if (receiveResult == AVERROR_EOF) {
                result.status = DecodeStatus::EndOfStream;
                return result;
            }

            if (receiveResult < 0) {
                result.status = DecodeStatus::Error;
                return result;
            }

            static bool formatLogged = false;
            if (!formatLogged) {
                __android_log_print(ANDROID_LOG_INFO, "FFmpegDecoder",
                    "FORMAT CHECK: codecCtx_->sample_fmt=%d, frame_->format=%d, codecCtx_->sample_rate=%d, frame_->sample_rate=%d, nb_samples=%d",
                    codecCtx_->sample_fmt, frame_->format,
                    codecCtx_->sample_rate, frame_->sample_rate,
                    frame_->nb_samples);
                formatLogged = true;
            }

            const int outSamples = swr_get_out_samples(swrCtx_, frame_->nb_samples) + 256;

            const int channels = 2; // output stereo

            const size_t neededSize = static_cast<size_t>(outSamples) * channels;
            if (scratchBuffer_.size() < neededSize) {
                scratchBuffer_.resize(neededSize * 2);
            }
            float* temp = scratchBuffer_.data();

            uint8_t* out[] = {
                reinterpret_cast<uint8_t*>(temp)
            };

            int converted = swr_convert(
                swrCtx_,
                out,
                outSamples,
                const_cast<const uint8_t**>(frame_->extended_data),
                frame_->nb_samples);

            if (converted > 0) {

    // 🔥 FIX: turunkan gain 3 dB untuk headroom
    constexpr float kGain = 0.89f;  // -1 dB
    for (size_t i = 0; i < static_cast<size_t>(converted) * channels; ++i) {
        temp[i] *= kGain;
    }

    // 🔥 NaN/Inf detection & cleanup
    {
        int nanCount = 0;
        for (size_t i = 0; i < static_cast<size_t>(converted) * channels; ++i) {
            float& v = temp[i];
            if (std::isnan(v) || std::isinf(v)) {
                nanCount++;
                v = 0.0f;
            }
        }
        static int totalNan = 0;
        totalNan += nanCount;
        if (nanCount > 0) {
            __android_log_print(ANDROID_LOG_WARN, "FFmpegDecoder",
                "NaN/Inf detected: %d of %zu samples cleaned (total=%d)",
                nanCount, static_cast<size_t>(converted) * channels, totalNan);
        }
    }

    result.samples.insert(
        result.samples.end(),
        temp,
        temp + converted * channels);

    // ✅ FIX: framesDecoded = input frames (44.1k), currentFrame_ = output frames (48k)
    result.framesDecoded += frame_->nb_samples;
    currentFrame_ += converted;

    // 🔥 DEBUG: log min/max setiap ~4096 output frames
    static int64_t totalOut = 0;
    totalOut += converted;
    if (totalOut % 4096 < static_cast<int64_t>(converted) && converted > 0) {
        float minV = 1e9f, maxV = -1e9f;
        double sumAbs = 0.0;
        const size_t debugN = static_cast<size_t>(converted) * channels;
        for (size_t i = 0; i < debugN; ++i) {
            float v = temp[i];
            if (v < minV) minV = v;
            if (v > maxV) maxV = v;
            sumAbs += (v < 0 ? -v : v);
        }
        float meanAbs = static_cast<float>(sumAbs / (static_cast<size_t>(converted) * channels));
        static int resampleLogCount = 0;
        resampleLogCount++;
        if (resampleLogCount % 500 == 0) {
            __android_log_print(ANDROID_LOG_INFO, "FFmpegDecoder",
                "resample out: min=%.4f max=%.4f mean=%.4f (frames=%d)",
                minV, maxV, meanAbs, converted);
        }
    }
}

            if (result.framesDecoded >= maxFrames)
                break;
        }

        if (result.framesDecoded >= maxFrames)
            break;
    }

    static int decodeLogCount = 0;
    decodeLogCount++;
    if (decodeLogCount % 500 == 0) {
        __android_log_print(ANDROID_LOG_INFO, "FFmpegDecoder",
                            "onDecode: framesDecoded=%u, status=%d",
                            result.framesDecoded, (int)result.status);
    }

    result.status =
        result.framesDecoded > 0
            ? DecodeStatus::Success
            : DecodeStatus::EndOfStream;

    result.framePosition = currentFrame_;

    return result;
}

// =====================================================
// SEEK
// =====================================================

bool FFmpegDecoder::onSeek(
    double positionSeconds) {

    if (!formatCtx_)
        return false;

    int64_t timestamp =
        static_cast<int64_t>(positionSeconds * AV_TIME_BASE);

    if (av_seek_frame(
            formatCtx_,
            -1,
            timestamp,
            AVSEEK_FLAG_BACKWARD) < 0) {
        return false;
    }

    avcodec_flush_buffers(codecCtx_);

    currentFrame_ =
        static_cast<uint64_t>(
            positionSeconds * codecCtx_->sample_rate);

    return true;
}
 
bool FFmpegDecoder::onSeekToFrame(
    uint64_t frame) {

    return onSeek(
        static_cast<double>(frame) / codecCtx_->sample_rate);
}

// =====================================================
// FORMAT INFO
// =====================================================

AudioFormat FFmpegDecoder::onGetInputFormat() const {
    AudioFormat format;

    if (!codecCtx_)
        return format;

    format.sampleRate = codecCtx_->sample_rate;
    format.channels = codecCtx_->ch_layout.nb_channels;
    format.sampleFormat = convertSampleFormat(codecCtx_->sample_fmt);
    format.durationSeconds = getDurationSeconds();

    // Map channel count to ChannelLayout
    switch (format.channels) {
        case 1: format.channelLayout = ChannelLayout::Mono; break;
        case 2: format.channelLayout = ChannelLayout::Stereo; break;
        case 6: format.channelLayout = ChannelLayout::Surround5_1; break;
        case 8: format.channelLayout = ChannelLayout::Surround7_1; break;
        default: format.channelLayout = ChannelLayout::Unknown; break;
    }

    return format;
}

DecoderCapabilities FFmpegDecoder::getCapabilities() const {
    DecoderCapabilities caps;

    caps.supportsSeeking = true;
    caps.supportsStreaming = true;
    caps.supportsGapless = true;
    caps.supportsMetadata = true;
    caps.supportsEmbeddedArtwork = false;
    caps.maxChannels = 8;
    caps.maxSampleRate = 192000;
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

double FFmpegDecoder::getDurationSeconds() const {
    if (!formatCtx_)
        return 0.0;

    return static_cast<double>(formatCtx_->duration) / AV_TIME_BASE;
}

// =====================================================
// POSITION
// =====================================================

double FFmpegDecoder::getPositionSeconds() const {
    return static_cast<double>(currentFrame_) / codecCtx_->sample_rate;
}

uint64_t FFmpegDecoder::getPositionFrames() const {
    return currentFrame_;
}

bool FFmpegDecoder::isSeekable() const {
    return formatCtx_ != nullptr;
}

// =====================================================
// INTERNAL
// =====================================================

bool FFmpegDecoder::setupCodec() {
    AVStream* stream =
        formatCtx_->streams[audioStreamIndex_];

    const AVCodec* codec =
        avcodec_find_decoder(stream->codecpar->codec_id);

    if (!codec)
        return false;

    codecCtx_ = avcodec_alloc_context3(codec);
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
    swrCtx_ = swr_alloc();
    if (!swrCtx_)
        return false;

    AVChannelLayout stereo;
    av_channel_layout_default(&stereo, 2);

    __android_log_print(ANDROID_LOG_DEBUG, "FFmpegDecoder",
                        "setupResampler: input_rate=%d, output_rate=%d",
                        codecCtx_->sample_rate, config().targetSampleRate);

    int ret = swr_alloc_set_opts2(
        &swrCtx_,
        &stereo,
        AV_SAMPLE_FMT_FLT,
        config().targetSampleRate,
        &codecCtx_->ch_layout,
        codecCtx_->sample_fmt,
        codecCtx_->sample_rate,
        0,
        nullptr);

    if (ret < 0) {
        __android_log_print(ANDROID_LOG_ERROR, "FFmpegDecoder",
                            "swr_alloc_set_opts2 failed: %d", ret);
        return false;
    }

    // 🔥 FIX: Upgrade resampler quality (default terlalu rendah → distorsi)
    // 🔥 filter_size=128 = high quality (default FFmpeg = 32)
    // NOTE: Turunkan ke 32/64 untuk performa di device low-end (fitur optimasi mendatang)
    // 🔥 Adaptive filter: filter lebih kecil untuk file >48k (CPU heavy)
    int filterSize = codecCtx_->sample_rate > 48000 ? 64 : 128;
    av_opt_set_int(swrCtx_, "filter_size", filterSize, 0);
    av_opt_set_double(swrCtx_, "cutoff", 0.97, 0);
    av_opt_set_int(swrCtx_, "linear_interp", 0, 0);
    av_opt_set_int(swrCtx_, "dither_method", SWR_DITHER_TRIANGULAR_HIGHPASS, 0);
    av_opt_set_double(swrCtx_, "dither_scale", 0.5, 0);  // 🔥 turun dari 1.0

    int init_ret = swr_init(swrCtx_);
    __android_log_print(ANDROID_LOG_INFO, "FFmpegDecoder",
                        "setupResampler: swr_init ret=%d (filter_size=128, cutoff=0.97, dither=0.5)",
                        init_ret);
    return init_ret >= 0;
}

void FFmpegDecoder::cleanup() {
    if (packet_) {
        av_packet_free(&packet_);
    }

    if (frame_) {
        av_frame_free(&frame_);
    }

    if (codecCtx_) {
        avcodec_free_context(&codecCtx_);
    }

    if (swrCtx_) {
        swr_free(&swrCtx_);
    }

    if (formatCtx_) {
        avformat_close_input(&formatCtx_);
    }

    audioStreamIndex_ = -1;
    currentFrame_ = 0;
}

// =====================================================
// HELPERS
// =====================================================

SampleFormat FFmpegDecoder::convertSampleFormat(int ffFormat) {
    switch (ffFormat) {
        case AV_SAMPLE_FMT_U8:  return SampleFormat::U8;
        case AV_SAMPLE_FMT_S16: return SampleFormat::S16;
        case AV_SAMPLE_FMT_S32: return SampleFormat::S32;
        case AV_SAMPLE_FMT_FLT: return SampleFormat::F32;
        case AV_SAMPLE_FMT_DBL: return SampleFormat::F64;
        default:                return SampleFormat::Unknown;
    }
}

} // namespace pristine::decoder