#pragma once

#include <memory>
#include <string>

#include "AudioDecoder.h"

namespace pristine {

class FFmpegDecoder :
    public AudioDecoder {

public:

    FFmpegDecoder();
    ~FFmpegDecoder() override;

    bool open(
        const std::string& uri
    ) override;

    void close() override;

    bool isOpen() const override;

    AudioStreamInfo
    getStreamInfo() const override;

    bool decodeNextChunk(
        DecodedChunk& outChunk,
        int32_t targetFrames
    ) override;

    void seek(
        double seconds
    ) override;

    double getCurrentPosition()
        const override;

private:

    struct Impl;

    std::unique_ptr<Impl> mImpl;
};

} // namespace pristine