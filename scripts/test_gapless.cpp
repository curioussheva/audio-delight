// =====================================================
// scripts/test_gapless.cpp
// =====================================================
//
// Uji parser gapless (decoder/GaplessInfo.h, header-only):
//   [1] Xing/LAME sintetis: delay 576 + padding 1148 + 1000 frame
//       MPEG1 Layer III -> total = 1000*1152 - 576 - 1148 = 1150276.
//   [2] Xing tanpa tag LAME -> false (bukan encoder LAME).
//   [3] Buffer tanpa frame MPEG / truncated -> false.
//   [4] ID3v2 di depan frame -> parser melompati tag.
//   [5] Xing "Info" (CBR) diterima sama seperti "Xing".
//   [6] MPEG2 Layer III: samplesPerFrame 576.
//   [7] iTunSMPB: "0 00000800 00000810 0000000000010000" ->
//       delay 2048, padding 2064, total 65536.
//   [8] iTunSMPB rusak (token kurang / hex invalid / nilai absurd)
//       -> false.
//
// Bangun & jalankan:
//   g++ -std=c++17 -O2 -I android/app/src/main/cpp \
//     scripts/test_gapless.cpp \
//     -o "$TMPDIR/test_gapless" && "$TMPDIR/test_gapless"

#include <cstdio>
#include <cstdint>
#include <cstring>
#include <vector>

#include "decoder/GaplessInfo.h"

using pristine::gapless::GaplessInfo;
using pristine::gapless::parseItunSmpb;
using pristine::gapless::parseXingLameHeader;

static int g_failures = 0;

#define CHECK(cond, msg)                                                     \
    do {                                                                     \
        if (!(cond)) {                                                       \
            std::printf("GAGAL: %s (baris %d)\n", msg, __LINE__);            \
            ++g_failures;                                                    \
        }                                                                    \
    } while (0)

// Bangun satu frame MP3 sintetis: header 4 byte + side info +
// "Xing" + flags + (frames) + "LAME" + 21 byte + delay/padding.
// version: 3=MPEG1, 2=MPEG2. stereo (channel mode 0).
static std::vector<uint8_t> buildFrame(uint32_t version,
                                       bool withLame,
                                       uint32_t delay,
                                       uint32_t padding,
                                       uint32_t frameCount,
                                       bool infoMagic) {
    std::vector<uint8_t> buf;
    // Header: 0xFF, 0xFB (MPEG1 Layer III, no CRC) atau 0xF3
    // (MPEG2 Layer III, no CRC). Byte 2-3: bitrate/sample rate
    // dummy + channel mode stereo (bit 7-6 byte 3 = 00).
    buf.push_back(0xFF);
    buf.push_back(version == 3 ? 0xFB : 0xF3);
    buf.push_back(0x90);  // bitrate idx 9, sample rate idx 0
    buf.push_back(0x00);  // stereo
    const size_t sideInfo = version == 3 ? 32 : 17;
    buf.resize(buf.size() + sideInfo, 0);
    // Xing/Info + flags (frames saja = 0x1) + frame count.
    const char* magic = infoMagic ? "Info" : "Xing";
    buf.insert(buf.end(), magic, magic + 4);
    buf.push_back(0x00);
    buf.push_back(0x00);
    buf.push_back(0x00);
    buf.push_back(0x01);
    buf.push_back((frameCount >> 24) & 0xFF);
    buf.push_back((frameCount >> 16) & 0xFF);
    buf.push_back((frameCount >> 8) & 0xFF);
    buf.push_back(frameCount & 0xFF);
    if (withLame) {
        buf.insert(buf.end(), {'L', 'A', 'M', 'E'});
        buf.resize(buf.size() + 17, 0);  // byte 4..20 tag LAME
        // Byte 21-23: delay (12 bit MSB) + padding (12 bit LSB).
        buf.push_back((delay >> 4) & 0xFF);
        buf.push_back(((delay & 0xF) << 4) | ((padding >> 8) & 0xF));
        buf.push_back(padding & 0xFF);
        buf.resize(buf.size() + 12, 0);  // sisa tag LAME
    }
    return buf;
}

int main() {
    // [1] Xing/LAME MPEG1: delay 576, padding 1148, 1000 frame.
    {
        auto buf = buildFrame(3, true, 576, 1148, 1000, false);
        GaplessInfo info;
        CHECK(parseXingLameHeader(buf.data(), buf.size(), info),
              "[1] Xing/LAME harus terparse");
        CHECK(info.encoderDelay == 576, "[1] delay 576");
        CHECK(info.padding == 1148, "[1] padding 1148");
        CHECK(info.totalAudioSamples == 1000ULL * 1152 - 576 - 1148,
              "[1] total = 1000*1152 - 576 - 1148");
        CHECK(info.source && std::strcmp(info.source, "xing") == 0, "[1] source xing");
    }

    // [2] Xing tanpa LAME -> false.
    {
        auto buf = buildFrame(3, false, 0, 0, 1000, false);
        GaplessInfo info;
        CHECK(!parseXingLameHeader(buf.data(), buf.size(), info),
              "[2] Xing tanpa LAME harus false");
    }

    // [3] Buffer tanpa frame / truncated -> false.
    {
        std::vector<uint8_t> junk(64, 0x00);
        GaplessInfo info;
        CHECK(!parseXingLameHeader(junk.data(), junk.size(), info),
              "[3a] tanpa sync harus false");
        auto buf = buildFrame(3, true, 576, 1148, 1000, false);
        GaplessInfo info2;
        CHECK(!parseXingLameHeader(buf.data(), 10, info2),
              "[3b] truncated harus false");
        GaplessInfo info3;
        CHECK(!parseXingLameHeader(nullptr, 0, info3),
              "[3c] null harus false");
    }

    // [4] ID3v2 di depan frame (ukuran synchsafe 20 byte).
    {
        auto frame = buildFrame(3, true, 576, 1148, 1000, false);
        std::vector<uint8_t> buf;
        buf.insert(buf.end(), {'I', 'D', '3', 0x04, 0x00, 0x00,
                               0x00, 0x00, 0x00, 0x14});  // size 20
        buf.resize(buf.size() + 20, 0x41);                 // isi tag dummy
        buf.insert(buf.end(), frame.begin(), frame.end());
        GaplessInfo info;
        CHECK(parseXingLameHeader(buf.data(), buf.size(), info),
              "[4] ID3v2 harus dilompati");
        CHECK(info.encoderDelay == 576, "[4] delay 576 sesudah ID3");
    }

    // [5] Magic "Info" diterima.
    {
        auto buf = buildFrame(3, true, 576, 1148, 1000, true);
        GaplessInfo info;
        CHECK(parseXingLameHeader(buf.data(), buf.size(), info),
              "[5] Info harus diterima");
        CHECK(info.encoderDelay == 576, "[5] delay 576 (Info)");
    }

    // [6] MPEG2 Layer III: 576 sampel/frame.
    {
        auto buf = buildFrame(2, true, 288, 574, 1000, false);
        GaplessInfo info;
        CHECK(parseXingLameHeader(buf.data(), buf.size(), info),
              "[6] MPEG2 Xing harus terparse");
        CHECK(info.totalAudioSamples == 1000ULL * 576 - 288 - 574,
              "[6] total = 1000*576 - 288 - 574");
    }

    // [7] iTunSMPB lengkap.
    {
        GaplessInfo info;
        CHECK(parseItunSmpb("0 00000800 00000810 0000000000010000",
                            info),
              "[7] iTunSMPB harus terparse");
        CHECK(info.encoderDelay == 2048, "[7] delay 0x800 = 2048");
        CHECK(info.padding == 2064, "[7] padding 0x810 = 2064");
        CHECK(info.totalAudioSamples == 65536, "[7] total 0x10000");
        CHECK(info.source && std::strcmp(info.source, "itunsmpb") == 0,
              "[7] source itunsmpb");
    }

    // [8] iTunSMPB rusak -> false.
    {
        GaplessInfo info;
        CHECK(!parseItunSmpb("0 00000800", info),
              "[8a] token kurang harus false");
        CHECK(!parseItunSmpb("0 ZZ 00000810 0000000000010000", info),
              "[8b] hex invalid harus false");
        CHECK(!parseItunSmpb("0 0000FFFF 00000810 0000000000010000",
                             info),
              "[8c] delay absurd harus false");
        CHECK(!parseItunSmpb("", info), "[8d] string kosong false");
        CHECK(!parseItunSmpb(nullptr, info), "[8e] null false");
    }

    if (g_failures == 0) {
        std::printf("test_gapless: SEMUA LULUS\n");
        return 0;
    }
    std::printf("test_gapless: %d KEGAGALAN\n", g_failures);
    return 1;
}
