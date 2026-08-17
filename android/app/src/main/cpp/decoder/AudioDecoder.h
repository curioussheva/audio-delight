#pragma once

#include "DecoderTypes.h"
#include "DecoderState.h"
#include "StreamResampler.h"

#include <memory>
#include <string>

namespace pristine::decoder {

// =====================================================
// AUDIO DECODER BASE CLASS
// =====================================================

class AudioDecoder {
public:
    explicit AudioDecoder(
        const DecodeConfig& config = {}
    );

    virtual ~AudioDecoder();

    AudioDecoder(const AudioDecoder&) = delete;
    AudioDecoder& operator=(const AudioDecoder&) = delete;

    // =====================================================
    // LIFECYCLE
    // =====================================================

    bool open(
        const std::string& uri,
        const AudioFormat* hint = nullptr
    );

    void close();

    [[nodiscard]]
    bool isOpen() const noexcept;

    // =====================================================
    // DECODE
    // =====================================================

    [[nodiscard]]
    DecodeResult decode(
        uint32_t maxFrames
    );

    // =====================================================
    // SEEK
    // =====================================================

    bool seek(
        double positionSeconds
    );

    bool seekToFrame(
        uint64_t frame
    );

    [[nodiscard]]
    virtual bool isSeekable() const = 0;

    // =====================================================
    // FORMAT
    // =====================================================

    [[nodiscard]]
    const AudioFormat&
    getInputFormat() const noexcept;

    [[nodiscard]]
    const AudioFormat&
    getOutputFormat() const noexcept;

    [[nodiscard]]
    virtual DecoderCapabilities
    getCapabilities() const = 0;

    void setTargetFormat(
        const AudioFormat& format
    );

    [[nodiscard]]
    bool needsResampling() const noexcept;

    // =====================================================
    // STATE
    // =====================================================

    [[nodiscard]]
    DecoderState getState() const noexcept;

    [[nodiscard]]
    bool isEof() const noexcept;

    [[nodiscard]]
    bool hasError() const noexcept;

    [[nodiscard]]
    const std::string&
    getLastError() const noexcept;

    // =====================================================
    // POSITION
    // =====================================================

    [[nodiscard]]
    virtual double
    getPositionSeconds() const = 0;

    [[nodiscard]]
    virtual uint64_t
    getPositionFrames() const = 0;

    [[nodiscard]]
    virtual double
    getDurationSeconds() const = 0;

protected:

    // =====================================================
    // IMPLEMENTED BY SUBCLASSES
    // =====================================================

    virtual bool onOpen(
        const std::string& uri,
        const AudioFormat* hint
    ) = 0;

    virtual void onClose() = 0;

    virtual DecodeResult onDecode(
        uint32_t maxFrames
    ) = 0;

    virtual bool onSeek(
        double positionSeconds
    ) = 0;

    virtual bool onSeekToFrame(
        uint64_t frame
    ) = 0;

    virtual AudioFormat onGetInputFormat() const = 0;

    // =====================================================
    // HELPERS FOR DERIVED CLASSES
    // =====================================================

    void setEof(
        bool eof
    ) noexcept;

    void setError(
        std::string error
    );

    void clearError();

    [[nodiscard]]
    const DecodeConfig&
    config() const noexcept;

private:
    DecodeResult applyResampling(
        DecodeResult&& result
    );

    void refreshFormats();

private:
    DecodeConfig config_;

    AtomicDecoderState state_;

    std::unique_ptr<StreamResampler>
        resampler_;

    AudioFormat inputFormat_;
    AudioFormat outputFormat_;

    bool isOpen_ = false;
    bool eof_ = false;

    std::string lastError_;
};

} // namespace pristine::decoder 