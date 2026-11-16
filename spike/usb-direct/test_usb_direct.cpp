// =====================================================
// spike/usb-direct/test_usb_direct.cpp
// =====================================================
//
// Harness host untuk spike USB Direct. Semua yang bisa dibuktikan
// tanpa DAC dibuktikan di sini (parser, sine, packet sizing, alur
// setup lengkap + streaming melawan MockUsbIo).
//
// Bangun & jalankan (dari root repo):
//   g++ -std=c++17 -O2 -I spike/usb-direct
//     spike/usb-direct/test_usb_direct.cpp
//     spike/usb-direct/usb_direct.cpp
//     spike/usb-direct/usb_direct_stream.cpp
//     -o /tmp/test_usb_direct && /tmp/test_usb_direct
//
// Dengan sanitizer:
//   g++ -std=c++17 -O1 -g -fsanitize=address,undefined -I spike/usb-direct
//     spike/usb-direct/test_usb_direct.cpp
//     spike/usb-direct/usb_direct.cpp
//     spike/usb-direct/usb_direct_stream.cpp
//     -o /tmp/test_usb_direct_asan && /tmp/test_usb_direct_asan
//
// Yang TIDAK dibuktikan harness ini (butuh DAC UAC2 + HP):
//   ioctl usbdevfs nyata, claim/lepas snd-usb-audio, bunyi di DAC.
//   Lihat README.md spike.
//
// SPDX-License-Identifier: MIT

#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <thread>
#include <vector>

#include "usb_direct.h"
#include "usb_direct_stream.h"

using namespace pristine::usb;

static int gPass = 0;
static int gFail = 0;

static void check(const char* what, bool ok) {
    std::printf("  [%s] %s\n", ok ? "PASS" : "FAIL", what);
    if (ok) gPass++; else gFail++;
}

// --- Builder blob deskriptor UAC2 (mirip dongle CX31993) ---
struct BlobBuilder {
    std::vector<uint8_t> b;
    void u8(uint8_t v) { b.push_back(v); }
    void u16(uint16_t v) { b.push_back(static_cast<uint8_t>(v & 0xFF)); b.push_back(static_cast<uint8_t>((v >> 8) & 0xFF)); }
    void u32(uint32_t v) { for (int i = 0; i < 4; ++i) b.push_back(static_cast<uint8_t>((v >> (8 * i)) & 0xFF)); }
    void bytes(const uint8_t* p, size_t n) { b.insert(b.end(), p, p + n); }
};

// Blob: AC iface (clock source 0x10) + AS iface alt 0 + alt 1 (iso OUT).
// syncTypeAlt1: 1=async, 3=sync. Bila addAlt2, alt 2 ditambah dengan
// endpoint async (untuk tes preferensi async).
static std::vector<uint8_t> buildBlob(uint8_t syncTypeAlt1 = 1, bool addAlt2 = false) {
    BlobBuilder w;
    // Configuration (9) — wTotalLength dipatch di akhir.
    w.u8(9); w.u8(0x02); w.u16(0); w.u8(2); w.u8(1); w.u8(0); w.u8(0x80); w.u8(250);
    // Interface 0 alt 0: AudioControl.
    w.u8(9); w.u8(0x04); w.u8(0); w.u8(0); w.u8(0); w.u8(0x01); w.u8(0x01); w.u8(0x20); w.u8(0);
    // CS_INTERFACE HEADER (9).
    w.u8(9); w.u8(0x24); w.u8(0x01); w.u16(0x0200); w.u8(0); w.u16(0); w.u8(0);
    // CS_INTERFACE CLOCK_SOURCE (8): id 0x10, internal fixed, freq RW.
    w.u8(8); w.u8(0x24); w.u8(0x0A); w.u8(0x10); w.u8(0x01); w.u8(0x03); w.u8(0); w.u8(0);
    // CS_INTERFACE INPUT_TERMINAL (17): id 1, USB streaming, clock 0x10, 2ch.
    w.u8(17); w.u8(0x24); w.u8(0x02); w.u8(0x01); w.u16(0x0101); w.u8(0); w.u8(0x10);
    w.u8(2); w.u32(0x00000003); w.u8(0); w.u16(0); w.u8(0);
    // CS_INTERFACE OUTPUT_TERMINAL (12): id 2, speaker, source 1, clock 0x10.
    w.u8(12); w.u8(0x24); w.u8(0x03); w.u8(0x02); w.u16(0x0301); w.u8(0); w.u8(0x01);
    w.u8(0x10); w.u16(0); w.u8(0);
    // Interface 1 alt 0: AudioStreaming, 0 endpoint.
    w.u8(9); w.u8(0x04); w.u8(1); w.u8(0); w.u8(0); w.u8(0x01); w.u8(0x02); w.u8(0x20); w.u8(0);
    // Interface 1 alt 1: AudioStreaming, 1 endpoint.
    w.u8(9); w.u8(0x04); w.u8(1); w.u8(1); w.u8(1); w.u8(0x01); w.u8(0x02); w.u8(0x20); w.u8(0);
    // AS_GENERAL (16): terminal link 1, format TYPE_I, 2ch.
    w.u8(16); w.u8(0x24); w.u8(0x01); w.u8(0x01); w.u8(0); w.u8(0x01); w.u32(0x00000001);
    w.u8(2); w.u32(0x00000003); w.u8(0);
    // FORMAT_TYPE_I (6): subslot 4, bitres 32.
    w.u8(6); w.u8(0x24); w.u8(0x02); w.u8(0x01); w.u8(4); w.u8(32);
    // ENDPOINT (7): OUT 0x01, iso + syncType, 1024 byte, interval 1.
    const uint8_t bmAttr = static_cast<uint8_t>(0x01 | (syncTypeAlt1 << 2));
    w.u8(7); w.u8(0x05); w.u8(0x01); w.u8(bmAttr); w.u16(1024); w.u8(1);
    // CS_ENDPOINT (8).
    w.u8(8); w.u8(0x25); w.u8(0x01); w.u8(0); w.u8(0); w.u8(0); w.u16(0);
    if (addAlt2) {
        // Interface 1 alt 2: sama seperti alt 1 tapi endpoint async.
        w.u8(9); w.u8(0x04); w.u8(1); w.u8(2); w.u8(1); w.u8(0x01); w.u8(0x02); w.u8(0x20); w.u8(0);
        w.u8(16); w.u8(0x24); w.u8(0x01); w.u8(0x01); w.u8(0); w.u8(0x01); w.u32(0x00000001);
        w.u8(2); w.u32(0x00000003); w.u8(0);
        w.u8(6); w.u8(0x24); w.u8(0x02); w.u8(0x01); w.u8(4); w.u8(32);
        w.u8(7); w.u8(0x05); w.u8(0x01); w.u8(0x05); w.u16(1024); w.u8(1);
        w.u8(8); w.u8(0x25); w.u8(0x01); w.u8(0); w.u8(0); w.u8(0); w.u16(0);
    }
    // Patch wTotalLength.
    const uint16_t total = static_cast<uint16_t>(w.b.size());
    w.b[2] = static_cast<uint8_t>(total & 0xFF);
    w.b[3] = static_cast<uint8_t>((total >> 8) & 0xFF);
    return w.b;
}

static std::vector<ClockRange> defaultRanges() {
    return {{44100, 44100, 0}, {48000, 48000, 0}, {96000, 96000, 0},
            {192000, 192000, 0}, {384000, 384000, 0}};
}

int main() {
    std::printf("== parser deskriptor UAC2 ==\n");
    {
        const auto blob = buildBlob();
        const ParseResult r = parseConfigDescriptor(blob.data(), blob.size(), 96000, 2, 4, 32);
        check("parse blob CX31993-like ok", r.ok);
        check("interface 1", r.choice.interfaceNumber == 1);
        check("alt setting 1", r.choice.altSetting == 1);
        check("endpoint OUT 0x01", r.choice.endpointAddress == 0x01);
        check("maxPacketSize 1024", r.choice.maxPacketSize == 1024);
        check("interval 1", r.choice.interval == 1);
        check("sync async", r.choice.syncType == 1);
        check("clock source 0x10", r.choice.clockSourceId == 0x10);
        check("format 2ch/4/32", r.choice.format.channels == 2 &&
                                   r.choice.format.subslotSize == 4 &&
                                   r.choice.format.bitResolution == 32);
        check("laju tercatat 96000", r.choice.format.sampleRate == 96000);
        check("altSettingsSeen 1", r.altSettingsSeen == 1);
    }
    {
        // Preferensi async: alt 1 sync, alt 2 async -> pilih alt 2.
        const auto blob = buildBlob(3, true);
        const ParseResult r = parseConfigDescriptor(blob.data(), blob.size(), 48000, 2, 4, 32);
        check("pilih async atas sync (alt 2)", r.ok && r.choice.altSetting == 2);
        check("altSettingsSeen 2", r.altSettingsSeen == 2);
    }
    {
        // Format tidak cocok.
        const auto blob = buildBlob();
        check("tolak channel 1", !parseConfigDescriptor(blob.data(), blob.size(), 48000, 1, 4, 32).ok);
        check("tolak subslot 2", !parseConfigDescriptor(blob.data(), blob.size(), 48000, 2, 2, 16).ok);
        check("tolak bitres 16", !parseConfigDescriptor(blob.data(), blob.size(), 48000, 2, 4, 16).ok);
    }
    {
        // Blob rusak.
        const auto blob = buildBlob();
        check("tolak blob kosong", !parseConfigDescriptor(nullptr, 0, 48000, 2, 4, 32).ok);
        check("tolak blob terpotong", !parseConfigDescriptor(blob.data(), 60, 48000, 2, 4, 32).ok);
        uint8_t onlyCfg[9] = {9, 0x02, 9, 0, 1, 1, 0, 0x80, 250};
        check("tolak tanpa AS interface",
              !parseConfigDescriptor(onlyCfg, sizeof(onlyCfg), 48000, 2, 4, 32).ok);
        std::vector<uint8_t> bad = blob;
        bad[1] = 0x99;  // bukan config descriptor
        check("tolak bDescriptorType salah",
              !parseConfigDescriptor(bad.data(), bad.size(), 48000, 2, 4, 32).ok);
    }

    std::printf("== packet sizing ==\n");
    check("HS interval bInterval=1 -> 125us", isoIntervalMicros(1, UsbSpeed::kHigh) == 125);
    check("HS interval bInterval=4 -> 1000us", isoIntervalMicros(4, UsbSpeed::kHigh) == 1000);
    check("FS interval bInterval=1 -> 1000us", isoIntervalMicros(1, UsbSpeed::kFull) == 1000);
    check("bInterval=0 -> 0", isoIntervalMicros(0, UsbSpeed::kHigh) == 0);
    check("48k @125us -> 6 frame", std::fabs(framesPerIsoPacket(48000, 1, UsbSpeed::kHigh) - 6.0) < 1e-9);
    check("384k @125us -> 48 frame", std::fabs(framesPerIsoPacket(384000, 1, UsbSpeed::kHigh) - 48.0) < 1e-9);
    check("44.1k @125us -> 5.5125 frame",
          std::fabs(framesPerIsoPacket(44100, 1, UsbSpeed::kHigh) - 5.5125) < 1e-9);
    {
        IsoFrameAccumulator acc(framesPerIsoPacket(44100, 1, UsbSpeed::kHigh));
        long long sum = 0;
        bool only56 = true;
        for (int i = 0; i < 8000; ++i) {
            const int n = acc.nextFrames();
            if (n != 5 && n != 6) only56 = false;
            sum += n;
        }
        check("akumulator 44.1k: hanya 5/6 frame", only56);
        check("akumulator 44.1k: 8000 paket = 44100 frame", sum == 44100);
        check("totalFrames() konsisten", acc.totalFrames() == 44100);
    }
    {
        AudioFormat fmt;
        fmt.sampleRate = 384000; fmt.channels = 2; fmt.subslotSize = 4; fmt.bitResolution = 32;
        char err[128] = {};
        check("384k/32bit muat di 1024", packetFits(384000, 1, UsbSpeed::kHigh, fmt, 1024, err, sizeof(err)));
        check("384k/32bit tidak muat di 100", !packetFits(384000, 1, UsbSpeed::kHigh, fmt, 100, err, sizeof(err)));
    }

    std::printf("== sine source ==\n");
    {
        SineSource sine(440.0, 48000.0, 0.5);
        uint8_t buf[480 * 8] = {};  // 480 frame stereo 32-bit
        const size_t n = sine.fill(buf, 480, 2, 4, 32);
        check("sine 480 frame = 3840 byte", n == 480 * 8);
        auto sample = [&](size_t frame) {
            const uint8_t* p = buf + frame * 8;
            const uint32_t u = static_cast<uint32_t>(p[0]) | (static_cast<uint32_t>(p[1]) << 8) |
                               (static_cast<uint32_t>(p[2]) << 16) | (static_cast<uint32_t>(p[3]) << 24);
            return static_cast<int32_t>(u);
        };
        check("sine frame 0 ~ 0", std::abs(sample(0)) < 1000);
        // Puncak ~ seperempat periode: 48000/440/4 = 27.27 frame.
        const int32_t peak = sample(27);
        check("sine puncak ~0.5 full-scale", peak > 900000000 && peak < 1100000000);
        // Kontinuitas: isi lagi, fase lanjut (tidak reset ke 0).
        uint8_t buf2[8] = {};
        sine.fill(buf2, 1, 2, 4, 32);
        const uint32_t u = static_cast<uint32_t>(buf2[0]) | (static_cast<uint32_t>(buf2[1]) << 8) |
                           (static_cast<uint32_t>(buf2[2]) << 16) | (static_cast<uint32_t>(buf2[3]) << 24);
        check("sine kontinu antar fill", static_cast<int32_t>(u) != 0);
        check("fase maju", sine.phase() > 0.0 && sine.phase() < 1.0);
    }
    {
        // 24-bit dalam slot 32-bit: left-justified -> byte terbawah 0.
        SineSource sine(1000.0, 48000.0, 0.5);
        uint8_t buf[8] = {};
        sine.fill(buf, 1, 2, 4, 24);
        // Frame 0 = 0, ambil frame ke-2 dari fill kedua? Sederhana: cek
        // semua byte terbawah dari 12 frame selalu 0.
        uint8_t bufB[12 * 8] = {};
        sine.fill(bufB, 12, 2, 4, 24);
        bool lowZero = true;
        for (int f = 0; f < 12; ++f) {
            if (bufB[f * 8 + 0] != 0 || bufB[f * 8 + 4] != 0) lowZero = false;
        }
        check("24-in-32 left-justified (byte bawah 0)", lowZero);
        (void)buf;
    }
    {
        // 16-bit: rentang int16.
        SineSource sine(440.0, 48000.0, 1.0);
        uint8_t buf[480 * 4] = {};
        sine.fill(buf, 480, 2, 2, 16);
        bool inRange = true;
        int16_t mn = 32767, mx = -32768;
        for (int f = 0; f < 480; ++f) {
            for (int ch = 0; ch < 2; ++ch) {
                const uint8_t* p = buf + f * 4 + ch * 2;
                const int16_t v = static_cast<int16_t>(static_cast<uint16_t>(p[0] | (p[1] << 8)));
                if (v < mn) mn = v;
                if (v > mx) mx = v;
            }
        }
        check("16-bit mencapai ±32767", mn <= -32760 && mx >= 32760);
        (void)inRange;
    }

    std::printf("== setup + streaming (mock) ==\n");
    {
        auto blob = buildBlob();
        auto io = std::make_unique<MockUsbIo>(blob, defaultRanges());
        MockUsbIo* mock = io.get();
        UsbDirectDevice dev(std::move(io));
        char err[256] = {};
        const int rc = dev.open(96000, 2, 4, 32, err, sizeof(err));
        check("device open 96k ok", rc == 0);
        if (rc != 0) std::printf("      err: %s\n", err);
        check("mock: claim dipanggil", mock->claimCalled());
        check("mock: claim iface 1", mock->claimedInterface() == 1);
        check("mock: setInterface alt 1", mock->setInterfaceAlt() == 1);
        check("mock: SET_CUR 96000", mock->lastSetRate() == 96000);
        check("mock: SET_CUR clock 0x10", mock->lastSetClockId() == 0x10);
        check("choice valid", dev.choice().valid());

        // Streaming sine 1 kHz sampai >= 64 paket selesai.
        SineSource sine(1000.0, 96000.0, 0.5);
        auto source = [&sine](uint8_t* out, size_t maxBytes) {
            const size_t frames = maxBytes / 8;
            return sine.fill(out, frames, 2, 4, 32);
        };
        check("startStreaming ok", dev.startStreaming(source) == 0);
        IsoStats st{};
        const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(5);
        while (std::chrono::steady_clock::now() < deadline) {
            st = dev.stats();
            if (st.packetsCompleted >= 64) break;
            std::this_thread::sleep_for(std::chrono::milliseconds(5));
        }
        dev.stopStreaming();
        st = dev.stats();
        std::printf("      stats: urbs=%llu/%llu pkt=%llu bytes=%llu err=%llu underrun=%llu frames=%llu\n",
                    (unsigned long long)st.urbsSubmitted, (unsigned long long)st.urbsCompleted,
                    (unsigned long long)st.packetsCompleted, (unsigned long long)st.bytesSent,
                    (unsigned long long)st.urbErrors, (unsigned long long)st.underruns,
                    (unsigned long long)st.framesSent);
        check(">= 64 paket selesai", st.packetsCompleted >= 64);
        check("0 URB error", st.urbErrors == 0);
        check("0 underrun", st.underruns == 0);
        check("bytes = paket x 96 byte (12 frame x 8)", st.bytesSent == st.packetsCompleted * 96);
        // framesSent dihitung saat refill (termasuk paket yang kemudian
        // di-discard saat stop) — jadi >= paket_selesai x 12, selisih
        // maksimal = paket yang masih in flight saat stop (4 URB x 8).
        check("frames >= paket x 12", st.framesSent >= st.packetsCompleted * 12);
        check("frames - paket x 12 <= 384 (in flight saat stop)",
              st.framesSent - st.packetsCompleted * 12 <= 384);
        check("urbs submitted >= completed", st.urbsSubmitted >= st.urbsCompleted);
        dev.close();
    }
    {
        // Laju tidak didukung -> open gagal dengan pesan.
        auto blob = buildBlob();
        auto io = std::make_unique<MockUsbIo>(blob, std::vector<ClockRange>{{48000, 48000, 0}});
        UsbDirectDevice dev(std::move(io));
        char err[256] = {};
        check("open 44100 ditolak (hanya 48k)", dev.open(44100, 2, 4, 32, err, sizeof(err)) != 0);
        check("pesan error menyebut laju", std::strstr(err, "44100") != nullptr);
    }
    {
        // GET_RANGE + rateSupported.
        auto blob = buildBlob();
        MockUsbIo mock(blob, {{44100, 44100, 0}, {48000, 192000, 1}});
        ClockRange ranges[4];
        const int n = queryClockRates(mock, 1, 0x10, ranges, 4);
        check("queryClockRates 2 range", n == 2);
        check("rate 44100 didukung", rateSupported(ranges, n, 44100));
        check("rate 96000 didukung (range)", rateSupported(ranges, n, 96000));
        check("rate 12345 ditolak", !rateSupported(ranges, n, 12345));
        check("rate 192001 ditolak", !rateSupported(ranges, n, 192001));
    }
    {
        // readConfigDescriptor via mock.
        auto blob = buildBlob();
        MockUsbIo mock(blob, defaultRanges());
        uint8_t buf[4096] = {};
        const int rc = readConfigDescriptor(mock, buf, sizeof(buf));
        check("readConfigDescriptor panjang penuh", rc == static_cast<int>(blob.size()));
        check("isi sama dengan blob", rc > 0 && std::memcmp(buf, blob.data(), blob.size()) == 0);
    }
    {
        // Underrun: source mati setelah 1000 byte -> underrun > 0,
        // streaming tetap jalan (paket silence).
        auto blob = buildBlob();
        auto io = std::make_unique<MockUsbIo>(blob, defaultRanges());
        UsbDirectDevice dev(std::move(io));
        char err[256] = {};
        check("device open 48k ok", dev.open(48000, 2, 4, 32, err, sizeof(err)) == 0);
        size_t budget = 1000;
        auto dyingSource = [&budget](uint8_t* out, size_t maxBytes) -> size_t {
            if (budget == 0) return 0;
            const size_t n = std::min(maxBytes, budget);
            std::memset(out, 0x11, n);
            budget -= n;
            return n;
        };
        check("startStreaming (dying source) ok", dev.startStreaming(dyingSource) == 0);
        IsoStats st{};
        const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(5);
        while (std::chrono::steady_clock::now() < deadline) {
            st = dev.stats();
            if (st.packetsCompleted >= 32) break;
            std::this_thread::sleep_for(std::chrono::milliseconds(5));
        }
        dev.stopStreaming();
        st = dev.stats();
        check("underrun tercatat", st.underruns > 0);
        check("paket tetap terkirim saat underrun", st.packetsCompleted >= 32);
        check("0 URB error saat underrun", st.urbErrors == 0);
        dev.close();
    }

    std::printf("\n%d PASS, %d FAIL\n", gPass, gFail);
    return gFail == 0 ? 0 : 1;
}
