// =====================================================
// scripts/test_usb_direct_output.cpp
// =====================================================
//
// Membuktikan integrasi USB Direct di level host (tanpa DAC, tanpa NDK):
//   (a) logika pemilihan backend (usbDirectEligible),
//   (b) konversi PCM float -> integer (convertFloatToPcm) — nilai eksak,
//   (c) UsbDirectOutput lewat MockUsbIo: open (UAC2 ok, UAC1 ditolak),
//       start/stop/close, render callback dipanggil, statistik konsisten.
//
// Yang TIDAK bisa dibuktikan di sini (butuh DAC UAC2 + HP): ioctl
// usbdevfs nyata, claim/lepas snd-usb-audio, bunyi di DAC, dan wiring
// JNI/Kotlin (hanya check_jni_pairs.py + CI).
//
// Bangun & jalankan (satu baris, tanpa backslash):
//   g++ -std=c++17 -O2 -I android/app/src/main/cpp -I spike/usb-direct scripts/test_usb_direct_output.cpp android/app/src/main/cpp/usb/UsbDirectOutput.cpp spike/usb-direct/usb_direct.cpp spike/usb-direct/usb_direct_stream.cpp -o /tmp/test_usb_direct_output && /tmp/test_usb_direct_output

#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <thread>
#include <vector>

#include "usb/UsbDirectOutput.h"

using namespace pristine::usb;

static int gPass = 0;
static int gFail = 0;

static void check(const char* what, bool ok) {
    std::printf("  [%s] %s\n", ok ? "PASS" : "FAIL", what);
    if (ok) gPass++; else gFail++;
}

// Blob UAC2 minimal (mirip buildBlob di test_usb_direct.cpp, dipangkas):
// config + AC iface + HEADER bcdADC + CLOCK_SOURCE + AS alt 0/1 +
// AS_GENERAL + FORMAT_TYPE_I + endpoint iso OUT. `uac2` false -> header
// 0x0100 (UAC1).
static std::vector<uint8_t> buildBlob(bool uac2 = true) {
    std::vector<uint8_t> b;
    auto u8 = [&](uint8_t v) { b.push_back(v); };
    auto u16 = [&](uint16_t v) {
        b.push_back(static_cast<uint8_t>(v & 0xFF));
        b.push_back(static_cast<uint8_t>((v >> 8) & 0xFF));
    };
    auto u32 = [&](uint32_t v) {
        for (int i = 0; i < 4; ++i)
            b.push_back(static_cast<uint8_t>((v >> (8 * i)) & 0xFF));
    };
    u8(9); u8(0x02); u16(0); u8(2); u8(1); u8(0); u8(0x80); u8(250);
    u8(9); u8(0x04); u8(0); u8(0); u8(0); u8(0x01); u8(0x01); u8(0x20); u8(0);
    u8(9); u8(0x24); u8(0x01); u16(uac2 ? 0x0200 : 0x0100); u8(0); u16(0); u8(0);
    u8(8); u8(0x24); u8(0x0A); u8(0x10); u8(0x01); u8(0x03); u8(0); u8(0);
    u8(9); u8(0x04); u8(1); u8(0); u8(0); u8(0x01); u8(0x02); u8(0x20); u8(0);
    u8(9); u8(0x04); u8(1); u8(1); u8(1); u8(0x01); u8(0x02); u8(0x20); u8(0);
    u8(16); u8(0x24); u8(0x01); u8(0x01); u8(0); u8(0x01); u32(0x00000001);
    u8(2); u32(0x00000003); u8(0);
    u8(6); u8(0x24); u8(0x02); u8(0x01); u8(4); u8(32);
    u8(7); u8(0x05); u8(0x01); u8(0x05); u16(1024); u8(1);
    u8(8); u8(0x25); u8(0x01); u8(0); u8(0); u8(0); u16(0);
    const uint16_t total = static_cast<uint16_t>(b.size());
    b[2] = static_cast<uint8_t>(total & 0xFF);
    b[3] = static_cast<uint8_t>((total >> 8) & 0xFF);
    return b;
}

static std::vector<ClockRange> ranges96k() {
    return {{44100, 44100, 0}, {48000, 48000, 0}, {96000, 96000, 0}};
}

int main() {
    std::printf("UsbDirectOutput — host test\n");

    // --- (a) logika pemilihan backend ---
    check("eligible: DAC + user aktif", usbDirectEligible(true, true));
    check("tidak eligible: tanpa DAC", !usbDirectEligible(false, true));
    check("tidak eligible: user tidak mengaktifkan",
          !usbDirectEligible(true, false));
    check("tidak eligible: keduanya false",
          !usbDirectEligible(false, false));

    // --- (b) konversi PCM ---
    // Pemetaan SIMETRIS (skala 32767, bukan 32768): 1.0 -> 0x7FFF,
    // -1.0 -> -32767 = 0x8001 (bukan 0x8000). Selisih 1 LSB, tidak
    // terdengar; simetri menghindari asimetri +32767/-32768.
    {
        uint8_t out[64] = {};
        const float in16[4] = {0.0f, 1.0f, -1.0f, 0.5f};
        const size_t n = convertFloatToPcm(in16, 2, out, 2, 2, 16);
        check("16-bit: 4 sampel -> 8 byte", n == 8);
        // LE: 0x0000, 0x7FFF, 0x8001, 0x4000 (lrint(0.5*32767)=16384).
        check("16-bit: 0.0 -> 0x0000", out[0] == 0x00 && out[1] == 0x00);
        check("16-bit: 1.0 -> 0x7FFF", out[2] == 0xFF && out[3] == 0x7F);
        check("16-bit: -1.0 -> 0x8001 (simetris)",
              out[4] == 0x01 && out[5] == 0x80);
        check("16-bit: 0.5 -> 0x4000", out[6] == 0x00 && out[7] == 0x40);

        const float clip[2] = {2.0f, -2.0f};
        convertFloatToPcm(clip, 1, out, 2, 2, 16);
        check("16-bit: 2.0 dijepit ke 0x7FFF",
              out[0] == 0xFF && out[1] == 0x7F);
        check("16-bit: -2.0 dijepit ke 0x8001",
              out[2] == 0x01 && out[3] == 0x80);

        const float nanIn[2] = {NAN, INFINITY};
        convertFloatToPcm(nanIn, 1, out, 2, 2, 16);
        check("16-bit: NaN/Inf -> 0",
              out[0] == 0x00 && out[1] == 0x00 && out[2] == 0x00 &&
                  out[3] == 0x00);

        const float in32[2] = {1.0f, -1.0f};
        convertFloatToPcm(in32, 1, out, 2, 4, 32);
        check("32-bit: 1.0 -> 0x7FFFFFFF",
              out[0] == 0xFF && out[1] == 0xFF && out[2] == 0xFF &&
                  out[3] == 0x7F);
        check("32-bit: -1.0 -> 0x80000001 (simetris)",
              out[4] == 0x01 && out[5] == 0x00 && out[6] == 0x00 &&
                  out[7] == 0x80);

        const float in24[2] = {1.0f, -1.0f};
        convertFloatToPcm(in24, 1, out, 2, 3, 24);
        check("24-bit: 1.0 -> 0x7FFFFF",
              out[0] == 0xFF && out[1] == 0xFF && out[2] == 0x7F);
        check("24-bit: -1.0 -> 0x800001 (simetris)",
              out[3] == 0x01 && out[4] == 0x00 && out[5] == 0x80);

        convertFloatToPcm(in24, 1, out, 2, 4, 24);
        check("24-dalam-32: 1.0 -> 0x7FFFFF00",
              out[0] == 0x00 && out[1] == 0xFF && out[2] == 0xFF &&
                  out[3] == 0x7F);
        check("24-dalam-32: -1.0 -> 0x80000100 (simetris)",
              out[4] == 0x00 && out[5] == 0x01 && out[6] == 0x00 &&
                  out[7] == 0x80);

        const float in8[2] = {0.0f, 1.0f};
        convertFloatToPcm(in8, 1, out, 2, 1, 8);
        check("8-bit: 0.0 -> 128, 1.0 -> 255",
              out[0] == 128 && out[1] == 255);

        check("argumen buruk -> 0 byte",
              convertFloatToPcm(nullptr, 1, out, 2, 2, 16) == 0 &&
                  convertFloatToPcm(in16, 0, out, 2, 2, 16) == 0 &&
                  convertFloatToPcm(in16, 1, out, 2, 5, 16) == 0);
    }

    // --- (c) UsbDirectOutput lewat MockUsbIo ---
    {
        UsbDirectOutput output;
        check("start tanpa open -> false",
              !output.start([](float*, int32_t) {}));

        char err[256] = {};
        auto io = std::make_unique<MockUsbIo>(buildBlob(true), ranges96k());
        check("open UAC2 96k ok",
              output.openWithIo(std::move(io), 96000, 2, 4, 32, err,
                                sizeof(err)));
        check("isOpen true", output.isOpen());
        check("choice: 96k stereo 32-bit",
              output.choice().format.sampleRate == 96000 &&
                  output.choice().format.channels == 2 &&
                  output.choice().format.subslotSize == 4);

        // Open kedua ditolak.
        auto io2 = std::make_unique<MockUsbIo>(buildBlob(true), ranges96k());
        check("open kedua -> false",
              !output.openWithIo(std::move(io2), 96000, 2, 4, 32, err,
                                 sizeof(err)));

        // Start: render callback harus dipanggil + statistik konsisten.
        int renderCalls = 0;
        long long renderedFrames = 0;
        auto render = [&](float* out, int32_t frames) {
            ++renderCalls;
            renderedFrames += frames;
            for (int i = 0; i < frames * 2; ++i) out[i] = 0.25f;
        };
        check("start ok", output.start(render));
        check("start kedua -> false",
              !output.start([](float*, int32_t) {}));
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
        const IsoStats st = output.stats();
        check("render callback dipanggil", renderCalls > 0);
        check("framesSent > 0", st.framesSent > 0);
        // framesSent = submitted, bytesSent = completed — selisihnya
        // URB in-flight (maks 4 URB x 8 paket x 96 frame @96 kHz).
        check("bytesSent <= framesSent*8, selisih < 4096 frame in-flight",
              st.bytesSent <= st.framesSent * 8 &&
                  st.framesSent * 8 - st.bytesSent < 4096ull * 8);
        check("0 URB error (mock)", st.urbErrors == 0);
        std::printf("      (renderCalls=%d framesSent=%llu bytesSent=%llu)\n",
                    renderCalls, (unsigned long long)st.framesSent,
                    (unsigned long long)st.bytesSent);

        output.stop();
        check("stop: tidak streaming lagi", !output.isStreaming());
        check("stats tetap terbaca sesudah stop",
              output.stats().framesSent > 0);

        // Restart sesudah stop.
        check("restart ok", output.start(render));
        std::this_thread::sleep_for(std::chrono::milliseconds(50));
        check("restart mengirim frame lagi",
              output.stats().framesSent > st.framesSent);
        output.close();
        check("close: tidak open lagi", !output.isOpen());
        check("close: tidak streaming", !output.isStreaming());
        // Statistik kumulatif: tidak mundur ke 0 sesudah close.
        check("stats tetap terbaca sesudah close (kumulatif)",
              output.stats().framesSent >= st.framesSent);
    }
    {
        // UAC1 (CM108) DITOLAK dengan pesan yang menyebut bcdADC.
        UsbDirectOutput output;
        char err[256] = {};
        auto io = std::make_unique<MockUsbIo>(buildBlob(false), ranges96k());
        const bool ok =
            output.openWithIo(std::move(io), 48000, 2, 4, 32, err,
                              sizeof(err));
        check("open UAC1 ditolak", !ok);
        check("pesan menyebut 0x0100",
              std::string(err).find("0x0100") != std::string::npos);
        check("isOpen tetap false", !output.isOpen());
        std::printf("      (pesan: %s)\n", err);
    }
    {
        // Laju tak didukung clock source ditolak.
        UsbDirectOutput output;
        char err[256] = {};
        auto io = std::make_unique<MockUsbIo>(buildBlob(true), ranges96k());
        check("open 12345 Hz ditolak",
              !output.openWithIo(std::move(io), 12345, 2, 4, 32, err,
                                 sizeof(err)));
        std::printf("      (pesan: %s)\n", err);
    }
    {
        // Bukan stereo ditolak.
        UsbDirectOutput output;
        char err[256] = {};
        auto io = std::make_unique<MockUsbIo>(buildBlob(true), ranges96k());
        check("open mono ditolak",
              !output.openWithIo(std::move(io), 48000, 1, 4, 32, err,
                                 sizeof(err)));
    }

    std::printf("\n%d PASS, %d FAIL\n", gPass, gFail);
    return gFail == 0 ? 0 : 1;
}
