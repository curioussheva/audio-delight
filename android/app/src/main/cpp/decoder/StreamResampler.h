#pragma once

#include "../core/AudioTypes.h"
#include "../dsp/resampler/LinearResampler.h"

namespace pristine {

// =====================================================
// STREAM RESAMPLER
// Decoder/playback orchestration layer
// =====================================================

class StreamResampler {
public:

    StreamResampler();

    void configure(
        int32_t inputRate,
        int32_t outputRate,
        int32_t channels
    );

    void reset();

    bool required() const;

    // =========================================
    // Resample decoded chunk
    // =========================================

    bool process(
        const DecodedChunk& input,
        DecodedChunk& output
    );

private:

    int32_t mInputRate = 48000;

    int32_t mOutputRate = 48000;

    int32_t mChannels = 2;

    bool mRequired = false;

    dsp::LinearResampler
        mResampler;

    std::vector<float>
        mOutputBuffer;
};

} // namespace pristine