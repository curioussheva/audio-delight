// =====================================================
// usb/UsbDirectOutput.cpp
// =====================================================
//
// Implementasi backend output kedua (USB Direct). Lihat header untuk
// desain + invarian. File ini + spike/usb-direct/*.cpp adalah SATU
// unit: parser/streamer tinggal di spike (sumber tunggal, dites
// harness host), wiring engine tinggal di sini.
//
// SPDX-License-Identifier: MIT

#include "UsbDirectOutput.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>

#ifdef __ANDROID__
#include <android/log.h>
#define UD_LOG(...) __android_log_print(ANDROID_LOG_DEBUG, "UsbDirect", __VA_ARGS__)
#else
#define UD_LOG(...) ((void)0)
#endif

namespace pristine::usb {
namespace {

int16_t clamp16(double v) {
    if (v > 32767.0) return 32767;
    if (v < -32768.0) return -32768;
    return static_cast<int16_t>(std::lrint(v));
}

int32_t clamp24(double v) {
    if (v > 8388607.0) return 8388607;
    if (v < -8388608.0) return -8388608;
    return static_cast<int32_t>(std::lrint(v));
}

int32_t clamp32(double v) {
    if (v > 2147483647.0) return 2147483647;
    if (v < -2147483648.0) return -2147483648;
    return static_cast<int32_t>(std::lrint(v));
}

}  // namespace

size_t convertFloatToPcm(const float* in, size_t frames, uint8_t* out,
                         uint8_t channels, uint8_t subslot,
                         uint8_t bitResolution) {
    if (in == nullptr || out == nullptr || frames == 0 || channels == 0 ||
        subslot == 0 || subslot > 4) {
        return 0;
    }
    const size_t samples = frames * channels;
    size_t pos = 0;
    for (size_t i = 0; i < samples; ++i) {
        // Clamp pertahanan terakhir (sanitasi sudah jalan di AudioCallback).
        float v = in[i];
        if (!std::isfinite(v)) v = 0.0f;
        if (v > 1.0f) v = 1.0f;
        if (v < -1.0f) v = -1.0f;
        switch (subslot) {
            case 1: {
                // 8-bit unsigned (pola SineSource spike).
                const int q = static_cast<int>(std::lrint((double)v * 127.0));
                const int c = q < -128 ? -128 : (q > 127 ? 127 : q);
                out[pos++] = static_cast<uint8_t>(128 + c);
                break;
            }
            case 2: {
                const uint16_t u =
                    static_cast<uint16_t>(clamp16((double)v * 32767.0));
                out[pos++] = static_cast<uint8_t>(u & 0xFF);
                out[pos++] = static_cast<uint8_t>((u >> 8) & 0xFF);
                break;
            }
            case 3: {
                const uint32_t u =
                    static_cast<uint32_t>(clamp24((double)v * 8388607.0)) &
                    0xFFFFFFu;
                out[pos++] = static_cast<uint8_t>(u & 0xFF);
                out[pos++] = static_cast<uint8_t>((u >> 8) & 0xFF);
                out[pos++] = static_cast<uint8_t>((u >> 16) & 0xFF);
                break;
            }
            case 4: {
                uint32_t u;
                if (bitResolution >= 32) {
                    u = static_cast<uint32_t>(
                        clamp32((double)v * 2147483647.0));
                } else {
                    // 24-dalam-32 left-justified (byte bawah 0).
                    u = static_cast<uint32_t>(clamp24((double)v * 8388607.0))
                        << 8;
                }
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
    return pos;
}

UsbDirectOutput::~UsbDirectOutput() {
    // Destructor: pastikan worker berhenti SEBELUM member dihancurkan.
    // close() idempotent — aman dipanggil dua kali (dari JNI + dtor).
    close();
}

bool UsbDirectOutput::open(int fd, uint32_t sampleRate, uint8_t channels,
                           uint8_t subslot, uint8_t bitResolution, char* err,
                           size_t errLen) {
    if (fd < 0) {
        if (err != nullptr && errLen > 0) {
            std::snprintf(err, errLen, "fd tidak valid");
        }
        return false;
    }
    auto io = std::make_unique<UsbdevfsIo>(fd);
    return openWithIo(std::move(io), sampleRate, channels, subslot,
                      bitResolution, err, errLen);
}

bool UsbDirectOutput::openWithIo(std::unique_ptr<UsbDeviceIo> io,
                                 uint32_t sampleRate, uint8_t channels,
                                 uint8_t subslot, uint8_t bitResolution,
                                 char* err, size_t errLen) {
    std::lock_guard<std::mutex> lock(mu_);
    if (open_) {
        if (err != nullptr && errLen > 0) {
            std::snprintf(err, errLen, "USB Direct sudah terbuka");
        }
        return false;
    }
    // App ini stereo-only: renderFrames() selalu menulis 2 kanal.
    // Membuka DAC mono/5.1 akan membuat konversi menulis frame yang
    // salah jumlah — tolak di sini, bukan di tengah streaming.
    if (channels != 2) {
        if (err != nullptr && errLen > 0) {
            std::snprintf(err, errLen,
                          "hanya stereo yang didukung (diminta %u kanal)",
                          channels);
        }
        return false;
    }
    auto device = std::make_unique<UsbDirectDevice>(std::move(io));
    const int rc = device->open(sampleRate, channels, subslot, bitResolution,
                                err, errLen);
    if (rc != 0) {
        return false;
    }
    choice_ = device->choice();
    device_ = std::move(device);
    open_ = true;
    UD_LOG("open ok: %u Hz, %u ch, subslot %u, bitres %u", sampleRate,
           channels, subslot, bitResolution);
    return true;
}

bool UsbDirectOutput::start(RenderCallback render) {
    std::lock_guard<std::mutex> lock(mu_);
    if (!open_ || streaming_ || !render) {
        return false;
    }
    // Scratch dialokasi SEKALI di sini (bukan di jalur realtime):
    // 4096 frame stereo float = 32 KiB.
    scratch_.assign(kMaxScratchFrames * 2, 0.0f);
    render_ = std::move(render);
    // fillPcm() membaca format dari choice_ (tetap selama streaming).
    auto source = [this](uint8_t* out, size_t maxBytes) {
        return fillPcm(out, maxBytes);
    };
    const int rc = device_->startStreaming(std::move(source));
    if (rc != 0) {
        render_ = nullptr;
        scratch_.clear();
        scratch_.shrink_to_fit();
        return false;
    }
    // Sesi baru dimulai dari 0 di streamer — sesi terakhir sudah
    // dibekukan di statsBase_ (di stop/close), jadi stats() yang baru
    // = statsBase_ + sesi baru.
    statsBaseIncludesLastSession_ = false;
    streaming_ = true;
    UD_LOG("startStreaming ok");
    return true;
}

size_t UsbDirectOutput::fillPcm(uint8_t* out, size_t maxBytes) {
    // Dipanggil dari worker thread IsoStreamer (SATU thread). scratch_
    // hanya disentuh di sini sesudah start() — stop() menggabung worker
    // sebelum scratch_ dibebaskan, jadi tidak ada race dengan close().
    if (out == nullptr || maxBytes == 0 || !render_) {
        return 0;
    }
    const uint16_t bpf = choice_.format.bytesPerFrame();
    if (bpf == 0) return 0;
    size_t frames = maxBytes / bpf;
    if (frames > kMaxScratchFrames) {
        // Tidak mungkin di bawah 384 kHz (maks ~384 frame/panggilan),
        // tapi jangan pernah menulis melewati scratch_: isi sebagian,
        // refill menambal sisanya dengan silence + hitung underrun.
        frames = kMaxScratchFrames;
    }
    render_(scratch_.data(), static_cast<int32_t>(frames));
    return convertFloatToPcm(scratch_.data(), frames, out,
                             choice_.format.channels,
                             choice_.format.subslotSize,
                             choice_.format.bitResolution);
}

void UsbDirectOutput::stop() {
    std::lock_guard<std::mutex> lock(mu_);
    if (device_) {
        device_->stopStreaming();
        freezeSessionStats();
    }
    streaming_ = false;
    render_ = nullptr;
}

void UsbDirectOutput::close() {
    std::lock_guard<std::mutex> lock(mu_);
    if (device_) {
        device_->close();
        freezeSessionStats();
        device_.reset();
    }
    streaming_ = false;
    open_ = false;
    render_ = nullptr;
    scratch_.clear();
    scratch_.shrink_to_fit();
}

bool UsbDirectOutput::isOpen() const {
    std::lock_guard<std::mutex> lock(mu_);
    return open_;
}

bool UsbDirectOutput::isStreaming() const {
    std::lock_guard<std::mutex> lock(mu_);
    return streaming_;
}

IsoStats UsbDirectOutput::stats() const {
    std::lock_guard<std::mutex> lock(mu_);
    if (!device_) return statsBase_;
    if (statsBaseIncludesLastSession_) {
        // Sesi terakhir sudah dibekukan di base; stats() device adalah
        // sesi yang sama — JANGAN dijumlah lagi (double-count).
        return statsBase_;
    }
    const IsoStats live = device_->stats();
    IsoStats total = statsBase_;
    total.urbsSubmitted += live.urbsSubmitted;
    total.urbsCompleted += live.urbsCompleted;
    total.packetsCompleted += live.packetsCompleted;
    total.bytesSent += live.bytesSent;
    total.urbErrors += live.urbErrors;
    total.shortPackets += live.shortPackets;
    total.underruns += live.underruns;
    total.framesSent += live.framesSent;
    return total;
}

void UsbDirectOutput::freezeSessionStats() {
    if (statsBaseIncludesLastSession_ || !device_) return;
    const IsoStats last = device_->stats();
    statsBase_.urbsSubmitted += last.urbsSubmitted;
    statsBase_.urbsCompleted += last.urbsCompleted;
    statsBase_.packetsCompleted += last.packetsCompleted;
    statsBase_.bytesSent += last.bytesSent;
    statsBase_.urbErrors += last.urbErrors;
    statsBase_.shortPackets += last.shortPackets;
    statsBase_.underruns += last.underruns;
    statsBase_.framesSent += last.framesSent;
    statsBaseIncludesLastSession_ = true;
}

}  // namespace pristine::usb
