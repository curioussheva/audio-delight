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
        return {
            .status = DecodeStatus::FatalError,
            .errorMessage = "Decoder not open"
        };
    }

    state_.set(DecoderState::Decoding);

    auto result = onDecode(maxFrames);

    if (result.status == DecodeStatus::Eof) {
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

    auto resampled = resampler_->process(
        result.samples,
        inputFormat_,
        outputFormat_
    );

    result.samples = std::move(resampled);

    return std::move(result);
}

} // namespace pristine::decoder 