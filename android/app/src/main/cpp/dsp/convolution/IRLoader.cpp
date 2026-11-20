// =====================================================
// dsp/convolution/IRLoader.cpp
// =====================================================
//
// Parser WAV minimal untuk impulse response. Lihat header untuk
// kontrak lengkap. Sengaja ditulis tanpa dependensi (tanpa FFmpeg,
// tanpa libsndfile): parser RIFF ~150 baris, dan IR dimuat di thread
// JNI/UI — bukan audio thread — jadi tidak ada tuntutan realtime.
//
// SPDX-License-Identifier: MIT

#include "IRLoader.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstring>

namespace pristine {

namespace {

// Baca little-endian dari buffer (file WAV selalu LE).
uint16_t readU16(const uint8_t* p) {
    return static_cast<uint16_t>(p[0]) |
        (static_cast<uint16_t>(p[1]) << 8);
}

uint32_t readU32(const uint8_t* p) {
    return static_cast<uint32_t>(p[0]) |
        (static_cast<uint32_t>(p[1]) << 8) |
        (static_cast<uint32_t>(p[2]) << 16) |
        (static_cast<uint32_t>(p[3]) << 24);
}

int32_t readS32(const uint8_t* p) {
    return static_cast<int32_t>(readU32(p));
}

float readF32(const uint8_t* p) {
    uint32_t bits = readU32(p);
    float value = 0.0f;
    std::memcpy(&value, &bits, sizeof(value));
    return value;
}

bool tagEquals(const uint8_t* p, const char* tag) {
    return std::memcmp(p, tag, 4) == 0;
}

} // namespace

IrLoadStatus IRLoader::loadWavMono(
    const std::string& path,
    WavIrData& out
) {

    if (path.empty()) {
        return IrLoadStatus::FileError;
    }

    FILE* file = std::fopen(path.c_str(), "rb");
    if (!file) {
        return IrLoadStatus::FileError;
    }

    // Baca seluruh file (IR dibatasi 10 detik mentah — file WAV IR
    // yang wajar < 5 MB; file raksasa ditolak belakangan lewat
    // durasi, tapi baca dulu dengan batas keras supaya file
    // ber-gigabyte tidak di-malloc).
    std::fseek(file, 0, SEEK_END);
    const long fileSizeLong = std::ftell(file);
    std::fseek(file, 0, SEEK_SET);
    if (fileSizeLong < 44) {
        std::fclose(file);
        return IrLoadStatus::FormatError;
    }
    // 64 MB: jauh di atas IR 10 detik apa pun (192 kHz stereo
    // float 10 dtk = 15 MB) — penahan file liar.
    if (fileSizeLong > 64L * 1024L * 1024L) {
        std::fclose(file);
        return IrLoadStatus::TooLong;
    }
    const size_t fileSize =
        static_cast<size_t>(fileSizeLong);

    std::vector<uint8_t> bytes(fileSize);
    if (
        std::fread(bytes.data(), 1, fileSize, file) != fileSize
    ) {
        std::fclose(file);
        return IrLoadStatus::FileError;
    }
    std::fclose(file);

    // ---- Header RIFF/WAVE ----
    if (
        !tagEquals(bytes.data(), "RIFF") ||
        !tagEquals(bytes.data() + 8, "WAVE")
    ) {
        return IrLoadStatus::FormatError;
    }

    // ---- Pindai chunk: fmt + data (chunk lain dilewati) ----
    uint16_t audioFormat = 0;
    uint16_t numChannels = 0;
    uint32_t sampleRate = 0;
    uint16_t bitsPerSample = 0;
    bool haveFmt = false;

    const uint8_t* dataPtr = nullptr;
    uint32_t dataSize = 0;
    bool haveData = false;

    size_t pos = 12;
    while (pos + 8 <= fileSize) {
        const uint8_t* chunk = bytes.data() + pos;
        const uint32_t chunkSize = readU32(chunk + 4);
        const size_t bodyPos = pos + 8;

        if (bodyPos + chunkSize > fileSize) {
            return IrLoadStatus::FormatError;
        }

        if (tagEquals(chunk, "fmt ")) {
            if (chunkSize < 16) {
                return IrLoadStatus::FormatError;
            }
            const uint8_t* fmt = bytes.data() + bodyPos;
            audioFormat = readU16(fmt + 0);
            numChannels = readU16(fmt + 2);
            sampleRate = readU32(fmt + 4);
            bitsPerSample = readU16(fmt + 14);
            haveFmt = true;
        } else if (tagEquals(chunk, "data")) {
            dataPtr = bytes.data() + bodyPos;
            dataSize = chunkSize;
            haveData = true;
        }

        // Chunk genap-padded (ukuran ganjil + 1 byte pad).
        pos = bodyPos + chunkSize + (chunkSize & 1u);
    }

    if (!haveFmt || !haveData || dataPtr == nullptr) {
        return IrLoadStatus::FormatError;
    }

    // ---- Validasi fmt ----
    // 1 = PCM integer, 3 = IEEE float.
    if (audioFormat != 1 && audioFormat != 3) {
        return IrLoadStatus::FormatError;
    }
    if (numChannels < 1 || numChannels > 2) {
        return IrLoadStatus::FormatError;
    }
    if (
        sampleRate < static_cast<uint32_t>(kMinSampleRateHz) ||
        sampleRate > static_cast<uint32_t>(kMaxSampleRateHz)
    ) {
        return IrLoadStatus::RateError;
    }
    if (audioFormat == 1) {
        if (
            bitsPerSample != 8 &&
            bitsPerSample != 16 &&
            bitsPerSample != 24 &&
            bitsPerSample != 32
        ) {
            return IrLoadStatus::FormatError;
        }
    } else {
        if (bitsPerSample != 32) {
            return IrLoadStatus::FormatError;
        }
    }

    const int bytesPerSample = bitsPerSample / 8;
    const size_t frameSize =
        static_cast<size_t>(bytesPerSample) * numChannels;
    if (frameSize == 0 || dataSize % frameSize != 0) {
        return IrLoadStatus::FormatError;
    }
    const size_t frameCount = dataSize / frameSize;

    // Durasi mentah maks 10 detik (dalam sampel pada laju file).
    const size_t maxFrames =
        static_cast<size_t>(sampleRate) *
        static_cast<size_t>(kMaxRawDurationSec);
    if (frameCount > maxFrames) {
        return IrLoadStatus::TooLong;
    }
    if (frameCount == 0) {
        return IrLoadStatus::Silent;
    }

    // ---- Decode ke mono float ----
    std::vector<float> samples;
    samples.reserve(frameCount);

    float peak = 0.0f;
    for (size_t f = 0; f < frameCount; ++f) {
        const uint8_t* frame =
            dataPtr + f * frameSize;

        float mono = 0.0f;
        for (uint16_t ch = 0; ch < numChannels; ++ch) {
            const uint8_t* p =
                frame + ch * static_cast<size_t>(bytesPerSample);
            float value = 0.0f;

            if (audioFormat == 3) {
                value = readF32(p);
            } else if (bitsPerSample == 8) {
                // PCM 8-bit unsigned, 128 = nol.
                value =
                    (static_cast<float>(p[0]) - 128.0f) / 128.0f;
            } else if (bitsPerSample == 16) {
                const int16_t v = static_cast<int16_t>(
                    readU16(p)
                );
                value = static_cast<float>(v) / 32768.0f;
            } else if (bitsPerSample == 24) {
                int32_t v =
                    static_cast<int32_t>(p[0]) |
                    (static_cast<int32_t>(p[1]) << 8) |
                    (static_cast<int32_t>(p[2]) << 16);
                if (v & 0x800000) {
                    v |= ~0xFFFFFF;
                }
                value = static_cast<float>(v) / 8388608.0f;
            } else { // 32-bit PCM
                value = static_cast<float>(readS32(p)) /
                    2147483648.0f;
            }

            if (!std::isfinite(value)) {
                return IrLoadStatus::FormatError;
            }
            mono += value;
        }

        // Stereo -> mono (L+R)/2; mono -> apa adanya.
        if (numChannels == 2) {
            mono *= 0.5f;
        }
        samples.push_back(mono);
        peak = std::fmax(peak, std::fabs(mono));
    }

    if (!(peak > 0.0f)) {
        return IrLoadStatus::Silent;
    }

    out.samples = std::move(samples);
    out.sampleRateHz = static_cast<int>(sampleRate);
    return IrLoadStatus::Ok;
}

} // namespace pristine
