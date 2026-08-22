#include "AudioDecoder.h"

namespace pristine::decoder {

AudioDecoder::AudioDecoder(
    const DecodeConfig& config
)
    : config_(config)
    , resampler_(std::make_unique<StreamResampler>())
{
}

AudioDecoder::~AudioDecoder()
{
    close();
}

bool AudioDecoder::open(
    const std::string& uri,
    const AudioFormat* hint
)
{
    close();

    state_.set(DecoderState::Opening);

    if (!onOpen(uri, hint)) {
        state_.set(DecoderState::Error);
        return false;
    }

    refreshFormats();

    eof_ = false;
    lastError_.clear();
    isOpen_ = true;

    state_.set(DecoderState::Ready);

    return true;
}

void AudioDecoder::close()
{
    if (!isOpen_) {
        return;
    }

    onClose();

    isOpen_ = false;
    eof_ = false;

    state_.set(DecoderState::Closed);
}

bool AudioDecoder::isOpen() const noexcept
{
    return isOpen_;
}

DecodeResult AudioDecoder::decode(
    uint32_t maxFrames
)
{
    if (!isOpen_) {
        DecodeResult result;
        result.status = DecodeStatus::FatalError;
        result.errorMessage = "Decoder not open";
        return result;
    }

    state_.set(DecoderState::Decoding);

    auto result = onDecode(maxFrames);

    if (result.status == DecodeStatus::EndOfStream) {
        eof_ = true;
        state_.set(DecoderState::EndOfStream);
        return result;
    }

    if (result.status == DecodeStatus::FatalError) {
        state_.set(DecoderState::Error);
        return result;
    }

    if (needsResampling()) {
        return applyResampling(std::move(result));
    }

    return result;
}

bool AudioDecoder::seek(
    double positionSeconds
)
{
    if (!isSeekable()) {
        return false;
    }

    state_.set(DecoderState::Seeking);

    const bool ok = onSeek(positionSeconds);

    state_.set(
        ok
            ? DecoderState::Ready
            : DecoderState::Error
    );

    eof_ = false;

    return ok;
}

bool AudioDecoder::seekToFrame(
    uint64_t frame
)
{
    if (!isSeekable()) {
        return false;
    }

    state_.set(DecoderState::Seeking);

    const bool ok = onSeekToFrame(frame);

    state_.set(
        ok
            ? DecoderState::Ready
            : DecoderState::Error
    );

    eof_ = false;

    return ok;
}

const AudioFormat&
AudioDecoder::getInputFormat() const noexcept
{
    return inputFormat_;
}

const AudioFormat&
AudioDecoder::getOutputFormat() const noexcept
{
    return outputFormat_;
}

void AudioDecoder::setTargetFormat(
    const AudioFormat& format
)
{
    outputFormat_ = format;
}

bool AudioDecoder::needsResampling() const noexcept
{
    return
        inputFormat_.sampleRate != outputFormat_.sampleRate ||
        inputFormat_.channels != outputFormat_.channels;
}

DecoderState
AudioDecoder::getState() const noexcept
{
    return state_.get();
}

bool AudioDecoder::isEof() const noexcept
{
    return eof_;
}

bool AudioDecoder::hasError() const noexcept
{
    return !lastError_.empty();
}

const std::string&
AudioDecoder::getLastError() const noexcept
{
    return lastError_;
}

void AudioDecoder::setEof(
    bool eof
) noexcept
{
    eof_ = eof;
}

void AudioDecoder::setError(
    std::string error
)
{
    lastError_ = std::move(error);

    state_.set(DecoderState::Error);
}

void AudioDecoder::clearError()
{
    lastError_.clear();
}

const DecodeConfig&
AudioDecoder::config() const noexcept
{
    return config_;
}

void AudioDecoder::refreshFormats()
{
    inputFormat_ = onGetInputFormat();

    if (!outputFormat_.isValid()) {
        outputFormat_ = inputFormat_;
    }
}

DecodeResult AudioDecoder::applyResampling(
    DecodeResult&& result
)
{
    if (!result.isSuccess()) {
        return std::move(result);
    }

    resampler_->configure(
        static_cast<int32_t>(inputFormat_.sampleRate),
        static_cast<int32_t>(outputFormat_.sampleRate),
        static_cast<int32_t>(inputFormat_.channels)
    );

    DecodedChunk input;
    input.pcm.data = result.samples.data();
    input.pcm.frames = static_cast<int32_t>(result.framesDecoded);
    input.pcm.channels = static_cast<int32_t>(inputFormat_.channels);
    input.pcm.interleaved = true;
    input.pts = static_cast<int64_t>(result.framePosition);

    DecodedChunk output;

    if (!resampler_->process(input, output) || output.pcm.data == nullptr) {
        return std::move(result);
    }

    std::vector<float> resampled(
        output.pcm.data,
        output.pcm.data + (static_cast<size_t>(output.pcm.frames) * output.pcm.channels)
    );

    result.samples = std::move(resampled);
    result.framesDecoded = static_cast<uint32_t>(output.pcm.frames);

    return std::move(result);
}

} // namespace pristine::decoder 