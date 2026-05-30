#include "StreamResampler.h"

namespace pristine {

// =====================================================
// CTOR
// =====================================================

StreamResampler::StreamResampler() = default;

// =====================================================
// CONFIGURE
// =====================================================

void StreamResampler::configure(
    int32_t inputRate,
    int32_t outputRate,
    int32_t channels
) {

    mInputRate =
        inputRate;

    mOutputRate =
        outputRate;

    mChannels =
        channels;

    mRequired =
        inputRate != outputRate;

    mResampler.configure(
        inputRate,
        outputRate,
        channels
    );
}

// =====================================================
// RESET
// =====================================================

void StreamResampler::reset() {

    mResampler.reset();
}

// =====================================================
// REQUIRED
// =====================================================

bool StreamResampler::required()
    const {

    return mRequired;
}

// =====================================================
// PROCESS
// =====================================================

bool StreamResampler::process(
    const DecodedChunk& input,
    DecodedChunk& output
) {

    if (!mRequired) {

        output = input;
        return true;
    }

    const int32_t estimatedFrames =
        mResampler
            .getOutputFramesForInput(
                input.pcm.frames
            );

    mOutputBuffer.resize(
        estimatedFrames *
        mChannels
    );

    const int32_t producedFrames =
        mResampler.process(
            input.pcm.data,
            input.pcm.frames,
            mOutputBuffer.data(),
            estimatedFrames
        );

    output.pcm.data =
        mOutputBuffer.data();

    output.pcm.frames =
        producedFrames;

    output.pcm.channels =
        mChannels;

    output.pcm.interleaved =
        true;

    output.pts =
        input.pts;

    output.endOfStream =
        input.endOfStream;

    output.discontinuity =
        input.discontinuity;

    return true;
}

} // namespace pristine