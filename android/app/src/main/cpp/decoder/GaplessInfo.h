// =====================================================
// decoder/GaplessInfo.h
// =====================================================
//
// Parser murni (tanpa FFmpeg, tanpa Android) untuk info delay/padding
// encoder — bahan gapless playback (2026-11-20).
//
// MP3/AAC membawa priming (encoder delay) di awal dan padding di
// akhir file: tanpa pemangkasan, setiap track MP3 mulai ~500-600
// sampel terlambat (priming ikut terputar sebagai keheningan) dan
// berakhir dengan padding — jeda kasat telinga di album live /
// lagu bersambung. FLAC/WAV/OGG sample-accurate secara alami dan
// TIDAK perlu trim — parser ini hanya untuk MP3 (Xing/LAME) dan
// MP4/M4A (iTunSMPB).
//
// Sumber yang diparse:
//   [1] Xing/LAME header di frame MP3 pertama — encoder delay +
//       padding (12+12 bit di byte 21-23 tag LAME) + jumlah frame
//       (field frames Xing) buat total sampel audio. Layout LAME:
//       http://gabriel.mp3-tech.org/mp3infotag.html — byte 21-23
//       tag LAME = delay (12 bit MSB) + padding (12 bit LSB).
//   [2] iTunSMPB (metadata stream MP4/M4A, ditulis iTunes/encoder
//       Apple): "0 <delay hex> <padding hex> <total sampel hex> ...".
//
// Header-only supaya bisa diuji host (scripts/test_gapless.cpp)
// tanpa NDK — FFmpegDecoder.cpp memakainya langsung.
//
// Aturan dedup (lihat FFmpegDecoder::onOpen/onDecode): side data
// AV_FRAME_DATA_SKIP_SAMPLES dari FFmpeg MENANG bila ada — Xing
// delay hanya dipakai di frame pertama bila side data tak pernah
// datang. Trim TIDAK aktif sesudah seek (posisi tengah lagu).
#pragma once

#include <cstddef>
#include <cstdint>
#include <cstring>

namespace pristine::gapless {

// Info delay/padding satu file, di domain INPUT (sampel per kanal,
// sebelum resample). totalAudioSamples = sampel audio asli tanpa
// delay+padding; 0 = tak diketahui (hanya trim awal yang bisa jalan).
struct GaplessInfo {
    uint32_t encoderDelay = 0;
    uint32_t padding = 0;
    uint64_t totalAudioSamples = 0;
    // "xing" / "itunsmpb" — pointer ke string literal statis.
    const char* source = nullptr;

    [[nodiscard]] bool hasInfo() const {
        return encoderDelay != 0 || padding != 0 ||
               totalAudioSamples != 0;
    }
};

namespace detail {

// Baca big-endian 32 bit tanpa asumsi alignment.
inline uint32_t readBe32(const uint8_t* p) {
    return (static_cast<uint32_t>(p[0]) << 24) |
           (static_cast<uint32_t>(p[1]) << 16) |
           (static_cast<uint32_t>(p[2]) << 8) |
           static_cast<uint32_t>(p[3]);
}

// Sampel per frame MPEG Audio dari header: Layer I = 384,
// Layer II = 1152, Layer III MPEG1 = 1152, MPEG2/2.5 = 576.
// version: 0=MPEG2.5, 2=MPEG2, 3=MPEG1 (nilai bit 4-3 byte 1).
// layer: 1=Layer III, 2=Layer II, 3=Layer I (nilai bit 2-1 byte 1).
inline uint32_t samplesPerFrame(uint32_t version, uint32_t layer) {
    if (layer == 3) return 384;   // Layer I
    if (layer == 2) return 1152;  // Layer II
    // Layer III: MPEG1 = 1152, MPEG2/2.5 = 576.
    return version == 3 ? 1152 : 576;
}

}  // namespace detail

// Parse header Xing/LAME dari buffer mentah (awal file MP3, boleh
// diawali tag ID3v2). Mengisi out (delay, padding, total sampel) dan
// mengembalikan true bila header Xing ditemukan — false bila tidak
// ada Xing/LAME atau buffer rusak/truncated. Nilai absurd (>8192
// sampel delay/padding) ditolak sebagai korup.
inline bool parseXingLameHeader(const uint8_t* data, size_t size,
                                GaplessInfo& out) {
    if (!data || size < 4) return false;

    size_t offset = 0;

    // Lewati tag ID3v2: "ID3" + 10 byte header, ukuran synchsafe
    // (7 bit per byte) di byte 6-9; +10 lagi bila ada footer (flag 0x10).
    if (size >= 10 && std::memcmp(data, "ID3", 3) == 0) {
        const size_t id3Size =
            ((static_cast<size_t>(data[6] & 0x7F) << 21) |
             (static_cast<size_t>(data[7] & 0x7F) << 14) |
             (static_cast<size_t>(data[8] & 0x7F) << 7) |
             static_cast<size_t>(data[9] & 0x7F));
        offset = 10 + id3Size;
        if (data[5] & 0x10) offset += 10;  // footer ID3v2.4
        if (offset >= size) return false;
    }

    // Cari sync frame MPEG pertama (11 bit sync + versi/layer valid)
    // — Xing hidup di frame pertama, jadi scan dibatasi 64 KiB.
    const size_t scanEnd = offset + 65536 < size ? offset + 65536 : size;
    size_t frameStart = size;
    uint32_t version = 0;
    uint32_t layer = 0;
    for (size_t i = offset; i + 1 < scanEnd; ++i) {
        if (data[i] != 0xFF) continue;
        const uint8_t b1 = data[i + 1];
        if ((b1 & 0xE0) != 0xE0) continue;   // 11 bit sync
        const uint32_t v = (b1 >> 3) & 0x3;  // bit 4-3
        const uint32_t l = (b1 >> 1) & 0x3;  // bit 2-1
        if (v == 1 || l == 0) continue;      // versi/layer reserved
        frameStart = i;
        version = v;
        layer = l;
        break;
    }
    if (frameStart == size) return false;

    // Ukuran side info (Layer III saja; Xing hanya ada di Layer III):
    // MPEG1 mono 17 / stereo 32; MPEG2/2.5 mono 9 / stereo 17.
    if (layer != 1) return false;  // bukan Layer III — tanpa Xing
    const uint8_t channelMode = (data[frameStart + 3] >> 6) & 0x3;
    const bool mono = channelMode == 3;
    const size_t sideInfoSize =
        version == 3 ? (mono ? 17 : 32) : (mono ? 9 : 17);

    const size_t xingOff = frameStart + 4 + sideInfoSize;
    if (xingOff + 8 > size) return false;
    if (std::memcmp(data + xingOff, "Xing", 4) != 0 &&
        std::memcmp(data + xingOff, "Info", 4) != 0) {
        return false;
    }

    const uint32_t flags = detail::readBe32(data + xingOff + 4);
    size_t p = xingOff + 8;
    uint32_t frameCount = 0;
    if (flags & 0x1) {  // jumlah frame
        if (p + 4 > size) return false;
        frameCount = detail::readBe32(data + p);
        p += 4;
    }
    if (flags & 0x2) p += 4;    // jumlah byte
    if (flags & 0x4) p += 100;  // TOC
    if (flags & 0x8) p += 4;    // kualitas VBR
    if (p + 36 > size) return false;

    // Tag LAME: "LAME" + 21 byte, lalu delay (12 bit) + padding
    // (12 bit) di byte 21-23 relatif ke awal "LAME".
    if (std::memcmp(data + p, "LAME", 4) != 0) return false;
    const uint8_t* lame = data + p;
    const uint32_t delay =
        (static_cast<uint32_t>(lame[21]) << 4) |
        (static_cast<uint32_t>(lame[22]) >> 4);
    const uint32_t padding =
        ((static_cast<uint32_t>(lame[22] & 0x0F) << 8) |
         static_cast<uint32_t>(lame[23]));
    // Sanity: delay/padding MP3 nyata < 2 frame (2304 sampel).
    // Nilai di atas itu = header korup, bukan data.
    if (delay > 8192 || padding > 8192) return false;

    out.encoderDelay = delay;
    out.padding = padding;
    if (frameCount > 0) {
        const uint64_t spf = detail::samplesPerFrame(version, layer);
        const uint64_t total = static_cast<uint64_t>(frameCount) * spf;
        const uint64_t overhead =
            static_cast<uint64_t>(delay) + padding;
        out.totalAudioSamples = total > overhead ? total - overhead : 0;
    }
    out.source = "xing";
    return true;
}

// Parse iTunSMPB: "0 <delay hex> <padding hex> <total sampel hex>
// <...>" — token dipisah spasi. Mengembalikan true bila minimal
// delay berhasil diparse; total 0 = tak diketahui (trim akhir
// dimatikan, trim awal tetap jalan).
inline bool parseItunSmpb(const char* value, GaplessInfo& out) {
    if (!value || !*value) return false;

    // Tokenisasi manual (tanpa strtok — reentrancy + tanpa alokasi).
    // Token TIDAK null-terminated di string asal — simpan [begin, end)
    // tiap token supaya parseHex tidak membaca melewati batas token.
    struct Token {
        const char* begin = nullptr;
        const char* end = nullptr;
    };
    Token tokens[8] = {};
    size_t count = 0;
    const char* p = value;
    while (*p && count < 8) {
        while (*p == ' ' || *p == '\t') ++p;
        if (!*p) break;
        tokens[count].begin = p;
        while (*p && *p != ' ' && *p != '\t') ++p;
        tokens[count].end = p;
        ++count;
    }
    if (count < 3) return false;  // butuh versi + delay + padding

    auto parseHex = [](const char* begin, const char* end,
                       uint64_t& v) -> bool {
        if (!begin || begin == end) return false;
        uint64_t r = 0;
        for (const char* c = begin; c != end; ++c) {
            uint32_t d;
            if (*c >= '0' && *c <= '9') d = *c - '0';
            else if (*c >= 'a' && *c <= 'f') d = *c - 'a' + 10;
            else if (*c >= 'A' && *c <= 'F') d = *c - 'A' + 10;
            else return false;
            r = (r << 4) | d;
            if (r > 0xFFFFFFFFULL) return false;  // di luar akal
        }
        v = r;
        return true;
    };

    uint64_t delay = 0;
    uint64_t padding = 0;
    if (!parseHex(tokens[1].begin, tokens[1].end, delay) ||
        !parseHex(tokens[2].begin, tokens[2].end, padding)) {
        return false;
    }
    if (delay > 8192 || padding > 8192) return false;

    out.encoderDelay = static_cast<uint32_t>(delay);
    out.padding = static_cast<uint32_t>(padding);
    if (count >= 4) {
        uint64_t total = 0;
        if (parseHex(tokens[3].begin, tokens[3].end, total)) {
            out.totalAudioSamples = total;
        }
    }
    out.source = "itunsmpb";
    return true;
}

}  // namespace pristine::gapless
