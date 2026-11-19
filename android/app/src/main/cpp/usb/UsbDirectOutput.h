// =====================================================
// usb/UsbDirectOutput.h
// =====================================================
//
// Backend output KEDUA (USB Direct, UAC2 via usbdevfs) — paralel dengan
// jalur Oboe/AAudio yang sudah ada. Integrasi spike/usb-direct ke engine
// (2026-11-19, R6 diputuskan: backend kedua, BUKAN pengganti output).
//
// Arsitektur:
//
//   PlaybackController --render--> AudioCallback::renderFrames()
//        |                              (frame float interleaved, SUDAH
//        |                               lewat pipeline DSP yang sama)
//        +-- Oboe (AudioStreamController, jalur lama, default)
//        |
//        +-- USB Direct (file ini): worker IsoStreamer memanggil render
//            yang SAMA, lalu convertFloatToPcm() -> URB isochronous.
//
// LOGIKA PEMILIHAN (aman, default tidak berubah):
//   - USB dipakai HANYA bila ketiganya benar: DAC UAC2 terdeteksi
//     (usbDirectEligible: perangkat audio USB ada + user mengaktifkan)
//     DAN native open() berhasil (parser menolak UAC1 — bcdADC != 0x0200
//     — dan laju yang diminta tidak didukung clock source).
//   - Gagal di titik mana pun -> resolve false, jalur AAudio tetap jalan
//     seperti sekarang. TANPA DAC UAC2 perilaku default TIDAK BERUBAH
//     sama sekali (tidak ada stream USB, tidak ada perubahan Oboe).
//   - DAC CM108 csheva (UAC1, 0d8c:000c) TIDAK PERNAH bisa lewat sini:
//     spike UAC2 saja; open() menolaknya dengan pesan eksplisit.
//
// INVARIAN SATU RENDER THREAD: hanya satu backend me-render dalam satu
// waktu. EngineManager menghentikan stream Oboe SEBELUM startStreaming
// USB, dan membuka ulang Oboe sesudah stop. renderFrames() tidak
// thread-safe terhadap dua pemanggil bersamaan.
//
// Yang BELUM ada (sengaja, sama seperti spike): servo feedback endpoint
// async (kirim di laju nominal; drift jangka panjang belum ditangani),
// dan sumber PCM selain decoder (render engine yang sama — bukan sine).
// Lihat spike/usb-direct/README.md § Risiko.
//
// SPDX-License-Identifier: MIT

#pragma once

#include <cstddef>
#include <cstdint>
#include <functional>
#include <memory>
#include <mutex>

#include "usb_direct.h"
#include "usb_direct_stream.h"

namespace pristine::usb {

// --- Logika pemilihan backend (murni, bisa dites di host) ---
// true hanya bila DAC UAC2 ada DAN user mengaktifkan USB Direct.
// `uac2Present` = perangkat audio USB terdeteksi (Kotlin
// UsbDirectManager.findAudioDevices() tidak kosong); verifikasi UAC2
// yang sebenarnya terjadi di open() (parser bcdADC) — di sini hanya
// gerbang pertama supaya Oboe tidak pernah disentuh tanpa DAC.
inline bool usbDirectEligible(bool uac2Present, bool userEnabled) {
    return uac2Present && userEnabled;
}

// --- Konversi PCM float -> integer (murni, bisa dites di host) ---
// `in` interleaved stereo float [-1, 1] (sudah lewat sanitasi output
// AudioCallback — NaN/Inf/|x|>2 dibuang di sana; di sini tetap di-clamp
// [-1, 1] sebagai pertahanan terakhir). Format mengikuti StreamChoice:
// subslot 1 = 8-bit unsigned, 2 = 16-bit LE, 3 = 24-bit LE,
// 4 = 32-bit LE, atau 24-dalam-32 left-justified bila bitRes == 24.
// Mengembalikan byte yang ditulis (frames * channels * subslot).
// `frames` HARUS <= kapasitas scratch pemanggil — fungsi ini tidak
// mengalokasi dan tidak memeriksa batas `out` selain yang dihitung.
size_t convertFloatToPcm(const float* in, size_t frames, uint8_t* out,
                         uint8_t channels, uint8_t subslot,
                         uint8_t bitResolution);

// Sumber render engine: isi `frames` frame float interleaved stereo.
// Dipasok EngineManager (terikat ke AudioEngine::renderForUsbOutput).
using RenderCallback = std::function<void(float* out, int32_t frames)>;

class UsbDirectOutput {
  public:
    UsbDirectOutput() = default;
    ~UsbDirectOutput();

    UsbDirectOutput(const UsbDirectOutput&) = delete;
    UsbDirectOutput& operator=(const UsbDirectOutput&) = delete;

    // Buka perangkat dari fd UsbDeviceConnection (Kotlin). fd MILIK
    // pemanggil (native TIDAK PERNAH close fd). Stereo saja — app ini
    // stereo-only; channels != 2 ditolak dengan pesan. 0 atau -errno
    // (lihat UsbDirectDevice::open); `err` berisi pesan manusiawi.
    bool open(int fd, uint32_t sampleRate, uint8_t channels = 2,
              uint8_t subslot = 4, uint8_t bitResolution = 32, char* err = nullptr,
              size_t errLen = 0);

    // Sama seperti open(), tapi backend I/O disuntik (MockUsbIo di host
    // test; produksi selalu lewat open() di atas).
    bool openWithIo(std::unique_ptr<UsbDeviceIo> io, uint32_t sampleRate,
                    uint8_t channels = 2, uint8_t subslot = 4,
                    uint8_t bitResolution = 32, char* err = nullptr,
                    size_t errLen = 0);

    // Mulai streaming: worker IsoStreamer memanggil `render` untuk
    // mengisi tiap paket. false bila belum open / sudah streaming.
    // `render` dipanggil dari worker thread — harus realtime-safe
    // (renderFrames() sudah memenuhi itu).
    bool start(RenderCallback render);

    // Hentikan streaming (gabung worker) — device tetap open.
    void stop();
    // Hentikan + lepas interface (best-effort) — device tertutup.
    void close();

    bool isOpen() const;
    bool isStreaming() const;
    const StreamChoice& choice() const { return choice_; }
    // Statistik KUMULATIF antar sesi start/stop (dan tetap terbaca
    // sesudah close): IsoStreamer spike membuat streamer baru tiap
    // start dengan stats dari 0, dan device_ di-reset di close() —
    // tanpa penjumlah di sini getStats() akan mundur ke 0 tiap restart
    // dan hilang sesudah close. framesSent menghitung frame yang
    // DIKIRIM ke streamer (submitted), bytesSent menghitung byte yang
    // SELESAI (completed) — pada satu waktu keduanya berbeda sebesar
    // URB yang masih in-flight (maks 4 URB x 8 paket x ~1 ms paket),
    // jadi bytesSent <= framesSent * bytesPerFrame, bukan sama persis.
    IsoStats stats() const;

  private:
    // PcmSource untuk IsoStreamer: render -> scratch float -> convert.
    size_t fillPcm(uint8_t* out, size_t maxBytes);

    // Pindahkan total sesi terakhir (frozen di UsbDirectDevice::stats()
    // sesudah stopStreaming) ke statsBase_. Idempotent per sesi.
    void freezeSessionStats();

    // Frame maksimum per panggilan source. URB = 8 paket x 48 frame
    // @384 kHz = 384 frame; 4096 memberi margin 10x dan tetap kecil
    // (4096 x 2ch x 4 byte = 32 KiB, dialokasi sekali di start()).
    static constexpr size_t kMaxScratchFrames = 4096;

    mutable std::mutex mu_;
    std::unique_ptr<UsbDirectDevice> device_;
    StreamChoice choice_;
    bool open_ = false;
    bool streaming_ = false;
    RenderCallback render_;
    std::vector<float> scratch_;
    // Total kumulatif sesi-sesi yang sudah berhenti; sesi yang sedang
    // berjalan ditambah di stats(). statsBaseIncludesLastSession_ =
    // true berarti sesi terakhir sudah dibekukan di statsBase_ (jadi
    // stats() device adalah sesi yang sama — jangan dijumlah lagi).
    IsoStats statsBase_{};
    bool statsBaseIncludesLastSession_ = true;
};

}  // namespace pristine::usb
