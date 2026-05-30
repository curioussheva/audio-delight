#pragma once

#include "DecoderTypes.h"

#include <string>

namespace pristine {

// =====================================================
// DECODE RESULT
// =====================================================

enum class DecodeResult {
    Ok,
    EndOfStream,
    NeedMoreData,
    Error
};

// =====================================================
// AUDIO DECODER INTERFACE
// =====================================================

class AudioDecoder {
public:

    virtual ~AudioDecoder();

    // =============================================
    // OPEN / CLOSE
    // =============================================

    virtual bool open(
        const std::string& uri
    ) = 0;

    virtual void close() = 0;

    virtual bool isOpen() const = 0;

    // =============================================
    // STREAM INFO
    // =============================================

    virtual AudioStreamInfo
    getStreamInfo() const = 0;

    // =============================================
    // DECODE
    // =============================================

    virtual DecodeResult decodeNextChunk(
        DecodedChunk& outChunk,
        int32_t targetFrames
    ) = 0;

    // =============================================
    // SEEK
    // =============================================

    virtual bool seek(
        double seconds
    ) = 0;

    // =============================================
    // FLUSH
    // =============================================

    virtual void flush() = 0;

    // =============================================
    // POSITION
    // =============================================

    virtual double
    getCurrentPosition() const = 0;

    // =============================================
    // EOF
    // =============================================

    virtual bool isEOF() const = 0;
};

} // namespace pristine