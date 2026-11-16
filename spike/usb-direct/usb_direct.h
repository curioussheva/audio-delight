// =====================================================
// spike/usb-direct/usb_direct.h
// =====================================================
//
// Inti spike "USB Direct" — BERBICARA LANGSUNG ke DAC USB UAC2 lewat
// usbdevfs (bypass total AudioFlinger / AAudio / ALSA / kernel mixer).
//
// File ini + usb_direct.cpp MURNI (tanpa syscall, tanpa JNI, tanpa Oboe):
//   (a) parsing deskriptor konfigurasi UAC2 -> pilih AudioStreaming
//       interface + alternate setting + endpoint isochronous OUT,
//   (b) generator nada test (sine) sebagai sumber PCM,
//   (c) hitung ukuran paket isochronous (frames/packet, bytes/packet).
//
// Yang BUTUH perangkat hidup (control transfer, claim, URB) ada di
// usb_direct_stream.h — dengan backend yang bisa diganti (usbdevfs nyata
// vs mock), supaya logika streaming bisa dites di host tanpa DAC.
//
// Status: SPIKE, bukan kode produksi. Tidak ikut ter-compile ke target
// app default (folder spike/ di luar glob CMakeLists app). UAC2 SAJA —
// dongle UAC1 (mis. C-Media CM108, 0d8c:000c) TIDAK kompatibel.
//
// SPDX-License-Identifier: MIT

#pragma once

#include <cstddef>
#include <cstdint>

namespace pristine::usb {

// --- Kecepatan bus USB (nilai dari USBDEVFS_GET_SPEED) ---
enum class UsbSpeed : int {
    kUnknown = 0,
    kLow = 1,     // 1.5 Mbps
    kFull = 2,    // 12 Mbps
    kHigh = 3,    // 480 Mbps
    kSuper = 5,   // 5 Gbps
    kSuperPlus = 6,
};

// --- Format PCM satu alternate setting AudioStreaming ---
struct AudioFormat {
    uint32_t sampleRate = 0;    // Hz — dari clock source (GET_RANGE), BUKAN dari deskriptor
    uint8_t channels = 0;       // dari AS_GENERAL bNrChannels (spike: 2)
    uint8_t subslotSize = 0;    // byte per sampel per channel (FORMAT_TYPE_I)
    uint8_t bitResolution = 0;  // bit valid per sampel (FORMAT_TYPE_I)

    uint16_t bytesPerFrame() const {
        return static_cast<uint16_t>(channels * subslotSize);
    }
    bool valid() const {
        return sampleRate > 0 && channels >= 1 && channels <= 8 && subslotSize >= 1 &&
               subslotSize <= 4 && bitResolution >= 1 && bitResolution <= 32;
    }
};

// --- Satu pilihan streaming yang bisa dipakai untuk playback ---
struct StreamChoice {
    uint8_t interfaceNumber = 0;   // nomor interface AudioStreaming
    uint8_t altSetting = 0;        // alternate setting yang membawa format ini
    uint8_t endpointAddress = 0;   // endpoint OUT isochronous (mis. 0x01)
    uint16_t maxPacketSize = 0;    // byte per (micro)frame — bit 10:0 wMaxPacketSize
    uint8_t interval = 0;          // bInterval endpoint
    uint8_t syncType = 0;          // bmAttributes bit 3:2: 0=none 1=async 2=adaptive 3=sync
    uint8_t clockSourceId = 0;     // entity ID CLOCK_SOURCE (0 = tidak ditemukan)
    AudioFormat format;

    bool valid() const {
        return (endpointAddress & 0x80) == 0 && endpointAddress != 0 && maxPacketSize > 0 &&
               interval > 0 && format.valid();
    }
};

// --- Hasil parsing ---
struct ParseResult {
    bool ok = false;
    StreamChoice choice;        // terisi bila ok
    int altSettingsSeen = 0;    // berapa alt setting AS dengan endpoint iso OUT
    char error[128] = {};
};

// Parse SATU blob deskriptor konfigurasi lengkap (diawali descriptor
// CONFIGURATION, panjang wTotalLength). Cari interface AudioStreaming
// (class 0x01, subclass 0x02) dengan endpoint isochronous OUT + format
// TYPE_I, lalu pilih alternate setting yang formatnya cocok dengan
// wantedChannels / wantedSubslotSize / wantedBitResolution.
//
// Laju sampel TIDAK ada di deskriptor UAC2 (beda dengan UAC1) — laju
// didapat dari clock source lewat GET_RANGE (lihat queryClockRates di
// usb_direct_stream.h). Jadi `wantedRate` di sini hanya dicatat ke
// choice.format.sampleRate; validasi "rate ini didukung" dilakukan di
// sisi live (queryClockRates + setClockFrequency).
//
// Aman terhadap blob rusak/terpotong: selalu false + error, tidak pernah
// baca di luar [data, data+len). Parser tidak mengalokasi memori.
ParseResult parseConfigDescriptor(const uint8_t* data, size_t len, uint32_t wantedRate,
                                  uint8_t wantedChannels, uint8_t wantedSubslotSize,
                                  uint8_t wantedBitResolution);

// Interval satu paket isochronous dalam mikrodetik, dari bInterval +
// kecepatan bus. High-speed: 125us * 2^(bInterval-1). Full-speed:
// bInterval ms. SuperSpeed: seperti high-speed (spike belum dukung SS —
// kembalikan 0).
uint32_t isoIntervalMicros(uint8_t bInterval, UsbSpeed speed);

// Frames per paket (bisa pecahan — 44.1 kHz @ 125us = 5.5125 frame).
// Pemanggil harus memakai akumulator fraksional (lihat IsoFrameAccumulator).
double framesPerIsoPacket(uint32_t sampleRate, uint8_t bInterval, UsbSpeed speed);

// Akumulator fraksional: bagi stream kontinu menjadi paket-paket dengan
// jumlah frame bulat, tanpa drift jangka panjang. Contoh 44.1 kHz @
// 125us: urutan 6,5,6,6,5,6,... — total frame tepat setelah N paket.
class IsoFrameAccumulator {
  public:
    IsoFrameAccumulator(double framesPerPacket)
        : framesPerPacket_(framesPerPacket), carry_(0.0) {}
    // Berapa frame untuk paket berikutnya (bulat, >= 0).
    int nextFrames();
    // Total frame yang sudah dikeluarkan.
    long long totalFrames() const { return totalFrames_; }

  private:
    double framesPerPacket_;
    double carry_;
    long long totalFrames_ = 0;
};

// --- Generator nada test (sumber PCM spike) ---
// Sine stereo interleaved, fase double (kontinu antar blok), amplitudo
// dalam [-1, 1]. Menulis PCM integer sesuai format (16/24-dalam-32/32-bit,
// little-endian). Dipakai sebagai pengganti decoder sampai integrasi
// dengan FFmpegDecoder diputuskan.
class SineSource {
  public:
    SineSource(double freqHz, double sampleRate, double amplitude = 0.5)
        : freqHz_(freqHz), sampleRate_(sampleRate), amplitude_(amplitude) {}

    // Isi `frames` frame interleaved stereo ke `out` (byte, LE).
    // subslotSize 1..4; bitResolution <= 32. Mengembalikan byte ditulis.
    size_t fill(uint8_t* out, size_t frames, uint8_t channels, uint8_t subslotSize,
                uint8_t bitResolution);

    // Fase saat ini (untuk tes kontinuitas).
    double phase() const { return phase_; }

  private:
    double freqHz_;
    double sampleRate_;
    double amplitude_;
    double phase_ = 0.0;  // dalam siklus [0, 1)
};

// Validasi ukuran paket: bytes/packet untuk rate+interval ini harus muat
// di maxPacketSize (per microframe). Kembalikan false + alasan bila tidak
// muat — artinya alternate setting itu tidak bisa dipakai pada rate ini.
bool packetFits(uint32_t sampleRate, uint8_t bInterval, UsbSpeed speed,
                const AudioFormat& format, uint16_t maxPacketSize, char* err, size_t errLen);

}  // namespace pristine::usb
