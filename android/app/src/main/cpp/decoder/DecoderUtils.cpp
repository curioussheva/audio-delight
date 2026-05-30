#include "DecoderUtils.h"

#include <algorithm>
#include <cstring>

namespace pristine {

// =====================================================
// S16 -> FLOAT
// =====================================================

void s16ToFloat(
    const int16_t* src,
    float* dst,
    int32_t numSamples
) {

    constexpr float scale =
        1.0f / 32768.0f;

    for (
        int32_t i = 0;
        i < numSamples;
        ++i
    ) {

        dst[i] =
            static_cast<float>(
                src[i]
            ) * scale;
    }
}

// =====================================================
// S24 -> FLOAT
// packed 3-byte little endian
// =====================================================

void s24ToFloat(
    const uint8_t* src,
    float* dst,
    int32_t numSamples
) {

    constexpr float scale =
        1.0f / 8388608.0f;

    for (
        int32_t i = 0;
        i < numSamples;
        ++i
    ) {

        int32_t sample =
            (
                src[i * 3 + 0]
            ) |
            (
                src[i * 3 + 1] << 8
            ) |
            (
                src[i * 3 + 2] << 16
            );

        // sign extend
        if (sample & 0x800000) {
            sample |= ~0xFFFFFF;
        }

        dst[i] =
            static_cast<float>(
                sample
            ) * scale;
    }
}

// =====================================================
// S32 -> FLOAT
// =====================================================

void s32ToFloat(
    const int32_t* src,
    float* dst,
    int32_t numSamples
) {

    constexpr float scale =
        1.0f / 2147483648.0f;

    for (
        int32_t i = 0;
        i < numSamples;
        ++i
    ) {

        dst[i] =
            static_cast<float>(
                src[i]
            ) * scale;
    }
}

// =====================================================
// INTERLEAVED -> PLANAR
// =====================================================

void interleavedStereoToPlanar(
    const float* interleaved,
    float* left,
    float* right,
    int32_t frames
) {

    for (
        int32_t i = 0;
        i < frames;
        ++i
    ) {

        left[i] =
            interleaved[i * 2];

        right[i] =
            interleaved[i * 2 + 1];
    }
}

// =====================================================
// PLANAR -> INTERLEAVED
// =====================================================

void planarStereoToInterleaved(
    const float* left,
    const float* right,
    float* interleaved,
    int32_t frames
) {

    for (
        int32_t i = 0;
        i < frames;
        ++i
    ) {

        interleaved[i * 2] =
            left[i];

        interleaved[i * 2 + 1] =
            right[i];
    }
}

// =====================================================
// ZERO BUFFER
// =====================================================

void zeroBuffer(
    float* buffer,
    int32_t samples
) {

    memset(
        buffer,
        0,
        sizeof(float) * samples
    );
}

// =====================================================
// APPLY GAIN
// =====================================================

void applyGain(
    float* buffer,
    int32_t samples,
    float gain
) {

    for (
        int32_t i = 0;
        i < samples;
        ++i
    ) {

        buffer[i] *= gain;
    }
}

} // namespace pristine