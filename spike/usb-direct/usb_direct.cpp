// =====================================================
// spike/usb-direct/usb_direct.cpp
// =====================================================
//
// Implementasi parser deskriptor UAC2 + sine + packet sizing.
// MURNI — tanpa syscall. Lihat usb_direct.h untuk kontraknya.
//
// Referensi deskriptor (USB Audio Class 2.0, "Audio20 final.pdf"):
///  - Interface class 0x01 audio; subclass 0x01 AudioControl,
//    0x02 AudioStreaming.
//  - CS_INTERFACE = 0x24, CS_ENDPOINT = 0x25.
//  - AC subtypes: HEADER 0x01, INPUT_TERMINAL 0x02, OUTPUT_TERMINAL 0x03,
//    FEATURE_UNIT 0x06, CLOCK_SOURCE 0x0A, CLOCK_SELECTOR 0x0B.
//  - AS subtypes: AS_GENERAL 0x01, FORMAT_TYPE 0x02.
//  - FORMAT_TYPE_I (bFormatType 0x01): bSubslotSize, bBitResolution.
//    UAC2 TIDAK mencantumkan laju sampel di deskriptor (beda UAC1) —
//    laju didapat dari clock source lewat GET_RANGE (live).
//  - Endpoint: bmAttributes bit 1:0 transfer type (01 = isochronous),
//    bit 3:2 sync type (01 async, 10 adaptive, 11 sync); wMaxPacketSize
//    bit 10:0 ukuran, bit 12:11 transaksi tambahan (high-speed).
//
// SPDX-License-Identifier: MIT

#include "usb_direct.h"

#include <cmath>
#include <cstdio>
#include <cstring>

namespace pristine::usb {
namespace {

// --- Konstanta deskriptor USB ---
constexpr uint8_t kDescConfiguration = 0x02;
constexpr uint8_t kDescInterface = 0x04;
constexpr uint8_t kDescEndpoint = 0x05;
constexpr uint8_t kDescCsInterface = 0x24;
constexpr uint8_t kDescCsEndpoint = 0x25;

constexpr uint8_t kAudioClass = 0x01;
constexpr uint8_t kSubAudioControl = 0x01;
constexpr uint8_t kSubAudioStreaming = 0x02;

constexpr uint8_t kAcClockSource = 0x0A;
constexpr uint8_t kAcHeader = 0x01;
constexpr uint8_t kAsGeneral = 0x01;
constexpr uint8_t kAsFormatType = 0x02;
constexpr uint8_t kFormatTypeI = 0x01;

constexpr double kPi = 3.14159265358979323846;

uint16_t readLe16(const uint8_t* p) {
    return static_cast<uint16_t>(p[0] | (p[1] << 8));
}

void setError(char* err, size_t errLen, const char* msg) {
    if (err != nullptr && errLen > 0) {
        std::snprintf(err, errLen, "%s", msg);
    }
}

// Skor kandidat: async (DAC master clock) > adaptive > sync > none.
int syncScore(uint8_t syncType) {
    switch (syncType) {
        case 1: return 3;  // async
        case 2: return 2;  // adaptive
        case 3: return 1;  // sync
        default: return 0;
    }
}

}  // namespace

ParseResult parseConfigDescriptor(const uint8_t* data, size_t len, uint32_t wantedRate,
                                  uint8_t wantedChannels, uint8_t wantedSubslotSize,
                                  uint8_t wantedBitResolution) {
    ParseResult result;
    if (data == nullptr || len < 9) {
        setError(result.error, sizeof(result.error), "blob terlalu pendek (< 9 byte)");
        return result;
    }
    if (data[0] < 9 || data[1] != kDescConfiguration) {
        setError(result.error, sizeof(result.error), "bukan deskriptor konfigurasi");
        return result;
    }

    // --- State saat jalan ---
    uint8_t curIface = 0xFF;
    uint8_t curSubclass = 0xFF;
    uint8_t curAlt = 0;
    bool curIsAudio = false;

    // Format alt setting yang sedang berjalan (diisi AS_GENERAL/FORMAT_TYPE
    // sebelum endpoint-nya muncul — urutan itu dijamin spec).
    uint8_t pendChannels = 0;
    uint8_t pendSubslot = 0;
    uint8_t pendBitRes = 0;
    bool pendHasFormat = false;

    uint8_t clockSourceId = 0;

    // Gate UAC2 (integrasi 2026-11-19): bcdADC dari header AudioControl
    // HARUS 0x0200. UAC1 (0x0100, mis. C-Media CM108 0d8c:000c) memakai
    // layout deskriptor berbeda (bNrChannels AS_GENERAL di offset 7,
    // laju di deskriptor) sehingga parser ini — yang membaca layout
    // UAC2 (offset 10, laju dari clock source) — akan salah baca bila
    // dibiarkan lolos. Perangkat UAC1 DITOLAK di sini dengan pesan yang
    // menyebut versinya, supaya jalur USB Direct tidak pernah mengklaim
    // DAC UAC1: pemanggil jatuh kembali ke AAudio.
    bool sawAcHeader = false;
    uint16_t bcdADC = 0;

    StreamChoice best;
    int bestSyncScore = -1;
    int altSeen = 0;

    size_t pos = 0;
    while (pos + 2 <= len) {
        const uint8_t bLength = data[pos];
        const uint8_t bType = data[pos + 1];
        if (bLength < 2) {
            setError(result.error, sizeof(result.error), "bLength < 2 — blob rusak");
            return result;
        }
        if (pos + bLength > len) {
            setError(result.error, sizeof(result.error), "deskriptor terpotong di ujung blob");
            return result;
        }
        const uint8_t* d = data + pos;

        switch (bType) {
            case kDescInterface: {
                if (bLength < 9) break;
                curIface = d[2];
                curAlt = d[3];
                curIsAudio = (d[5] == kAudioClass);
                curSubclass = curIsAudio ? d[6] : 0xFF;
                // Alt setting baru -> reset format pending.
                pendChannels = 0;
                pendSubslot = 0;
                pendBitRes = 0;
                pendHasFormat = false;
                break;
            }
            case kDescCsInterface: {
                if (bLength < 3) break;
                const uint8_t subtype = d[2];
                if (!curIsAudio) break;
                if (curSubclass == kSubAudioControl && subtype == kAcHeader) {
                    // HEADER AudioControl: bcdADC le16 di offset 3.
                    if (bLength >= 5) {
                        sawAcHeader = true;
                        bcdADC = readLe16(d + 3);
                    }
                }
                if (curSubclass == kSubAudioControl && subtype == kAcClockSource) {
                    // CLOCK_SOURCE: bClockID di offset 3.
                    if (bLength >= 8 && clockSourceId == 0) {
                        clockSourceId = d[3];
                    }
                } else if (curSubclass == kSubAudioStreaming && curAlt > 0) {
                    if (subtype == kAsGeneral) {
                        // AS_GENERAL (UAC2, 16 byte): bNrChannels di offset 10
                        // (setelah bmFormats le32 di offset 6-9). AWAS: ini
                        // BUKAN offset 7 — itu layout UAC1.
                        if (bLength >= 11) {
                            pendChannels = d[10];
                        }
                    } else if (subtype == kAsFormatType) {
                        // FORMAT_TYPE_I: bFormatType offset 3, bSubslotSize
                        // offset 4, bBitResolution offset 5.
                        if (bLength >= 6 && d[3] == kFormatTypeI) {
                            pendSubslot = d[4];
                            pendBitRes = d[5];
                            pendHasFormat = true;
                        }
                    }
                }
                break;
            }
            case kDescEndpoint: {
                if (bLength < 7) break;
                if (!curIsAudio || curSubclass != kSubAudioStreaming || curAlt == 0) break;
                const uint8_t epAddr = d[2];
                const uint8_t bmAttr = d[3];
                const uint8_t transferType = bmAttr & 0x03;
                const uint8_t syncType = (bmAttr >> 2) & 0x03;
                const bool isOut = (epAddr & 0x80) == 0;
                if (transferType != 0x01 || !isOut) break;  // bukan iso OUT
                ++altSeen;

                // Kapasitas efektif per microframe: (1 + mult) * size.
                const uint16_t wMax = readLe16(d + 4);
                const uint16_t pktSize = static_cast<uint16_t>(wMax & 0x07FF);
                const uint16_t mult = static_cast<uint16_t>((wMax >> 11) & 0x03);
                const uint16_t effective = static_cast<uint16_t>((1 + mult) * pktSize);

                if (!pendHasFormat || pendChannels == 0) break;  // format tak dikenal
                if (pendChannels != wantedChannels || pendSubslot != wantedSubslotSize ||
                    pendBitRes != wantedBitResolution) {
                    break;  // format tidak cocok dengan yang diminta
                }

                StreamChoice cand;
                cand.interfaceNumber = curIface;
                cand.altSetting = curAlt;
                cand.endpointAddress = epAddr;
                cand.maxPacketSize = effective;
                cand.interval = d[6];
                cand.syncType = syncType;
                cand.clockSourceId = clockSourceId;
                cand.format.sampleRate = wantedRate;
                cand.format.channels = pendChannels;
                cand.format.subslotSize = pendSubslot;
                cand.format.bitResolution = pendBitRes;

                const int score = syncScore(syncType);
                if (!best.valid() || score > bestSyncScore ||
                    (score == bestSyncScore && effective > best.maxPacketSize)) {
                    best = cand;
                    bestSyncScore = score;
                }
                break;
            }
            default:
                break;
        }
        pos += bLength;
    }

    result.altSettingsSeen = altSeen;
    if (!sawAcHeader) {
        setError(result.error, sizeof(result.error),
                 "tidak ada header AudioControl — bukan perangkat UAC2?");
        return result;
    }
    if (bcdADC != 0x0200) {
        char msg[128];
        std::snprintf(msg, sizeof(msg),
                      "bukan UAC2 (bcdADC=0x%04x) — UAC1 tidak didukung",
                      bcdADC);
        setError(result.error, sizeof(result.error), msg);
        return result;
    }
    if (!best.valid()) {
        if (altSeen == 0) {
            setError(result.error, sizeof(result.error),
                     "tidak ada endpoint isochronous OUT di interface AudioStreaming");
        } else {
            setError(result.error, sizeof(result.error),
                     "ada endpoint iso OUT, tapi format (channel/subslot/bitres) tidak cocok");
        }
        return result;
    }
    result.ok = true;
    result.choice = best;
    return result;
}

uint32_t isoIntervalMicros(uint8_t bInterval, UsbSpeed speed) {
    if (bInterval == 0 || bInterval > 16) return 0;
    switch (speed) {
        case UsbSpeed::kHigh:
        case UsbSpeed::kSuper:
        case UsbSpeed::kSuperPlus:
            // 125us * 2^(bInterval-1)
            return 125u << (bInterval - 1);
        case UsbSpeed::kFull:
        case UsbSpeed::kLow:
            return static_cast<uint32_t>(bInterval) * 1000u;
        default:
            return 0;
    }
}

double framesPerIsoPacket(uint32_t sampleRate, uint8_t bInterval, UsbSpeed speed) {
    const uint32_t us = isoIntervalMicros(bInterval, speed);
    if (us == 0 || sampleRate == 0) return 0.0;
    return static_cast<double>(sampleRate) * static_cast<double>(us) / 1e6;
}

int IsoFrameAccumulator::nextFrames() {
    carry_ += framesPerPacket_;
    int n = static_cast<int>(carry_);
    carry_ -= n;
    totalFrames_ += n;
    return n;
}

size_t SineSource::fill(uint8_t* out, size_t frames, uint8_t channels, uint8_t subslotSize,
                        uint8_t bitResolution) {
    if (out == nullptr || frames == 0 || channels == 0 || subslotSize == 0 || subslotSize > 4) {
        return 0;
    }
    const double step = freqHz_ / sampleRate_;
    size_t pos = 0;
    for (size_t f = 0; f < frames; ++f) {
        const double v = amplitude_ * std::sin(2.0 * kPi * phase_);
        phase_ += step;
        if (phase_ >= 1.0) phase_ -= std::floor(phase_);
        for (uint8_t ch = 0; ch < channels; ++ch) {
            switch (subslotSize) {
                case 1: {
                    const int q = static_cast<int>(std::lrint(v * 127.0));
                    out[pos++] = static_cast<uint8_t>(128 + (q < -128 ? -128 : (q > 127 ? 127 : q)));
                    break;
                }
                case 2: {
                    int q = static_cast<int>(std::lrint(v * 32767.0));
                    if (q > 32767) q = 32767;
                    if (q < -32768) q = -32768;
                    const uint16_t u = static_cast<uint16_t>(static_cast<int16_t>(q));
                    out[pos++] = static_cast<uint8_t>(u & 0xFF);
                    out[pos++] = static_cast<uint8_t>((u >> 8) & 0xFF);
                    break;
                }
                case 3: {
                    int q = static_cast<int>(std::lrint(v * 8388607.0));
                    if (q > 8388607) q = 8388607;
                    if (q < -8388608) q = -8388608;
                    const uint32_t u = static_cast<uint32_t>(q) & 0xFFFFFFu;
                    out[pos++] = static_cast<uint8_t>(u & 0xFF);
                    out[pos++] = static_cast<uint8_t>((u >> 8) & 0xFF);
                    out[pos++] = static_cast<uint8_t>((u >> 16) & 0xFF);
                    break;
                }
                case 4: {
                    int32_t q;
                    if (bitResolution >= 32) {
                        double s = v * 2147483647.0;
                        q = static_cast<int32_t>(std::lrint(s > 2147483647.0 ? 2147483647.0
                                                           : (s < -2147483648.0 ? -2147483648.0 : s)));
                    } else {
                        // 24-bit (atau kurang) dalam slot 32-bit: left-justified.
                        const int shift = 32 - bitResolution;
                        const double full = static_cast<double>((1LL << (bitResolution - 1)) - 1);
                        int32_t base = static_cast<int32_t>(std::lrint(v * full));
                        q = static_cast<int32_t>(base << shift);
                    }
                    const uint32_t u = static_cast<uint32_t>(q);
                    out[pos++] = static_cast<uint8_t>(u & 0xFF);
                    out[pos++] = static_cast<uint8_t>((u >> 8) & 0xFF);
                    out[pos++] = static_cast<uint8_t>((u >> 16) & 0xFF);
                    out[pos++] = static_cast<uint8_t>((u >> 24) & 0xFF);
                    break;
                }
                default:
                    return 0;
            }
        }
    }
    return pos;
}

bool packetFits(uint32_t sampleRate, uint8_t bInterval, UsbSpeed speed,
                const AudioFormat& format, uint16_t maxPacketSize, char* err, size_t errLen) {
    const double fpp = framesPerIsoPacket(sampleRate, bInterval, speed);
    if (fpp <= 0.0) {
        setError(err, errLen, "interval/laju tidak valid (frames/packet = 0)");
        return false;
    }
    const uint32_t worstFrames = static_cast<uint32_t>(std::ceil(fpp));
    const uint32_t need = worstFrames * format.bytesPerFrame();
    if (need > maxPacketSize) {
        if (err != nullptr && errLen > 0) {
            std::snprintf(err, errLen, "butuh %u byte/paket, endpoint hanya %u",
                          need, static_cast<unsigned>(maxPacketSize));
        }
        return false;
    }
    return true;
}

}  // namespace pristine::usb
