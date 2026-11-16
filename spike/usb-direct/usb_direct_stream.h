// =====================================================
// spike/usb-direct/usb_direct_stream.h
// =====================================================
//
// Streaming isochronous via usbdevfs + setup perangkat UAC2.
//
// Arsitektur (supaya bisa dites di host tanpa DAC):
//   UsbDeviceIo  — SATU interface untuk semua yang menyentuh fd:
//                  control transfer, speed, claim/set interface,
//                  submit/reap/discard URB. Dua implementasi:
//                  UsbdevfsIo (ioctl nyata) dan MockUsbIo (host).
//   IsoStreamer  — ring N URB x P paket, worker thread reap->refill->
//                  resubmit; sumber PCM berupa callback (sine di spike,
//                  decoder nanti).
//   UsbDirectDevice — orkestrasi: baca deskriptor -> parse -> cek laju
//                  clock -> claim -> set interface -> set clock -> stream.
//
// Yang BELUM ada di spike ini (sengaja, lihat README):
//   - servo feedback endpoint async (kirim di laju nominal; drift
//     jangka panjang belum ditangani),
//   - integrasi decoder FFmpeg (sumber PCM masih sine),
//   - JNI/Kotlin di sini hanya jembatan (file terpisah).
//
// SPDX-License-Identifier: MIT

#pragma once

#include <atomic>
#include <cstddef>
#include <cstdint>
#include <condition_variable>
#include <functional>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

#include "usb_direct.h"

namespace pristine::usb {

// --- UAC2 AudioControl requests (kernel audio-v2.h / sound/usb/format.c) ---
// Kode request: SET_CUR 0x01, GET_RANGE 0x02 (UAC2_CS_CUR / UAC2_CS_RANGE).
// Arah ada di bRequestType, BUKAN di kode request (beda dengan UAC1).
//   SET_CUR:  bRequestType 0x21 (class/interface/host-to-device)
//   GET_RANGE: bRequestType 0xA1 (class/interface/device-to-host)
// wValue = (controlSelector << 8) | channel(0)
// wIndex = (entityId << 8) | interfaceNumber
// Selector laju clock source: UAC2_CS_CONTROL_SAM_FREQ = 0x01.
// GET_RANGE mengembalikan: wNumSubRanges (le16) + N x {dMIN, dMAX, dRES}
// (masing-masing le32) = 12 byte per range.

struct ClockRange {
    uint32_t minHz = 0;
    uint32_t maxHz = 0;
    uint32_t resHz = 0;  // 0 = laju tetap (min == max)
};

// Satu backend untuk semua I/O perangkat. Implementasi nyata memakai
// ioctl pada fd dari UsbDeviceConnection.getFileDescriptor(); mock
// memakai data canned + antrean URB di memori.
class UsbDeviceIo {
  public:
    virtual ~UsbDeviceIo() = default;

    // Control transfer. Kembalikan byte yang ditransfer, atau -errno.
    virtual int controlTransfer(uint8_t reqType, uint8_t request, uint16_t value,
                                uint16_t index, uint8_t* data, uint16_t len,
                                uint32_t timeoutMs) = 0;

    virtual UsbSpeed speed() = 0;

    // Claim interface (lepas driver kernel bila perlu — lihat .cpp).
    // Kembalikan 0 atau -errno.
    virtual int claimInterface(int iface) = 0;
    virtual int releaseInterface(int iface) = 0;
    virtual int setInterface(int iface, int alt) = 0;

    // URB isochronous. submit/reap/discard; reap non-blocking bila
    // block=false (kembalikan -EAGAIN bila antrean kosong).
    virtual int submitUrb(void* urb) = 0;
    virtual int reapUrb(void** urb, bool block) = 0;
    virtual int discardUrb(void* urb) = 0;
};

// Backend nyata: ioctl usbdevfs pada fd.
class UsbdevfsIo : public UsbDeviceIo {
  public:
    explicit UsbdevfsIo(int fd) : fd_(fd) {}
    int controlTransfer(uint8_t reqType, uint8_t request, uint16_t value, uint16_t index,
                        uint8_t* data, uint16_t len, uint32_t timeoutMs) override;
    UsbSpeed speed() override;
    int claimInterface(int iface) override;
    int releaseInterface(int iface) override;
    int setInterface(int iface, int alt) override;
    int submitUrb(void* urb) override;
    int reapUrb(void** urb, bool block) override;
    int discardUrb(void* urb) override;

  private:
    int fd_;
};

// Backend mock (host): deskriptor + range clock canned; URB "selesai"
// seketika saat disubmit. Mencatat panggilan untuk assert di harness.
class MockUsbIo : public UsbDeviceIo {
  public:
    MockUsbIo(std::vector<uint8_t> configBlob, std::vector<ClockRange> ranges);
    int controlTransfer(uint8_t reqType, uint8_t request, uint16_t value, uint16_t index,
                        uint8_t* data, uint16_t len, uint32_t timeoutMs) override;
    UsbSpeed speed() override { return UsbSpeed::kHigh; }
    int claimInterface(int iface) override;
    int releaseInterface(int iface) override;
    int setInterface(int iface, int alt) override;
    int submitUrb(void* urb) override;
    int reapUrb(void** urb, bool block) override;
    int discardUrb(void* urb) override;

    // --- Observasi untuk harness ---
    bool claimCalled() const { return claimCalled_; }
    int claimedInterface() const { return claimedIface_; }
    int setInterfaceAlt() const { return setIfaceAlt_; }
    uint32_t lastSetRate() const { return lastSetRate_; }
    uint32_t lastSetClockId() const { return lastSetClockId_; }
    int submitCount() const { return submitCount_; }

  private:
    std::vector<uint8_t> configBlob_;
    std::vector<ClockRange> ranges_;
    mutable std::mutex mu_;
    std::condition_variable cv_;
    std::vector<void*> completed_;
    bool wake_ = false;
    bool claimCalled_ = false;
    int claimedIface_ = -1;
    int setIfaceAlt_ = -1;
    uint32_t lastSetRate_ = 0;
    uint32_t lastSetClockId_ = 0;
    int submitCount_ = 0;
};

// Baca deskriptor konfigurasi lengkap lewat control transfer
// GET_DESCRIPTOR (dua langkah: 9 byte dulu untuk wTotalLength).
// Kembalikan byte terbaca, atau -errno. GETDESCRIPTOR ioctl TIDAK ADA
// di kernel modern — jangan pernah pakai.
int readConfigDescriptor(UsbDeviceIo& io, uint8_t* buf, size_t cap);

// Query range laju clock source (GET_RANGE). Kembalikan jumlah range
// yang ditulis ke `out` (<= maxOut), atau -errno.
int queryClockRates(UsbDeviceIo& io, uint8_t interfaceNumber, uint8_t clockId,
                    ClockRange* out, int maxOut);

// True bila `rate` dicakup salah satu range (res==0 berarti laju tetap).
bool rateSupported(const ClockRange* ranges, int count, uint32_t rate);

// Set laju clock source (SET_CUR). Kembalikan 0 atau -errno.
int setClockFrequency(UsbDeviceIo& io, uint8_t interfaceNumber, uint8_t clockId,
                      uint32_t rate);

// --- Statistik streaming ---
struct IsoStats {
    uint64_t urbsSubmitted = 0;
    uint64_t urbsCompleted = 0;
    uint64_t packetsCompleted = 0;
    uint64_t bytesSent = 0;
    uint64_t urbErrors = 0;     // URB/paket dengan status != 0
    uint64_t shortPackets = 0;  // actual_length < length
    uint64_t underruns = 0;     // source tidak sediakan data saat refill
    uint64_t framesSent = 0;
};

// Sumber PCM: isi sampai maxBytes, kembalikan byte yang ditulis.
// 0 = underrun (streamer kirim silence + hitung underrun).
using PcmSource = std::function<size_t(uint8_t* out, size_t maxBytes)>;

// Ring URB isochronous: numUrbs URB in flight, masing-masing
// packetsPerUrb paket. Worker thread: reap -> isi ulang -> submit lagi.
class IsoStreamer {
  public:
    IsoStreamer(UsbDeviceIo& io, const StreamChoice& choice, int numUrbs = 4,
                int packetsPerUrb = 8);
    ~IsoStreamer();

    IsoStreamer(const IsoStreamer&) = delete;
    IsoStreamer& operator=(const IsoStreamer&) = delete;

    // Prefill + submit semua URB + jalankan worker. 0 atau -errno.
    int start(PcmSource source);
    // Discard URB in flight, gabung worker. Idempotent.
    void stop();
    bool running() const { return running_.load(); }
    IsoStats stats() const;
    const StreamChoice& choice() const { return choice_; }

  private:
    struct Slot {
        void* urb = nullptr;        // usbdevfs_urb + iso_frame_desc[]
        uint8_t* buffer = nullptr;  // buffer_length byte
        int bufferBytes = 0;
        std::atomic<bool> submitted{false};
    };

    void workerLoop();
    // Isi satu slot dari source; kembalikan false bila source habis
    // total (bukan underrun sesaat) — spike: tidak pernah terjadi.
    bool refill(Slot& slot);

    UsbDeviceIo& io_;
    StreamChoice choice_;
    int numUrbs_;
    int packetsPerUrb_;
    std::vector<std::unique_ptr<Slot>> slots_;
    PcmSource source_;
    IsoFrameAccumulator acc_{0.0};
    std::thread worker_;
    std::atomic<bool> stopping_{false};
    std::atomic<bool> running_{false};
    std::atomic<int> inFlight_{0};
    mutable std::mutex statsMu_;
    IsoStats stats_;
};

// Orkestrasi perangkat: setup + streaming.
class UsbDirectDevice {
  public:
    explicit UsbDirectDevice(std::unique_ptr<UsbDeviceIo> io) : io_(std::move(io)) {}

    // Setup lengkap: baca deskriptor -> parse -> cek laju clock ->
    // claim -> set interface -> set clock. 0 atau -errno; bila gagal,
    // `err` berisi pesan yang bisa dibaca manusia.
    int open(uint32_t wantedRate, uint8_t channels, uint8_t subslot, uint8_t bitRes,
             char* err, size_t errLen);
    int startStreaming(PcmSource source);
    void stopStreaming();
    void close();  // lepas interface + kembalikan alt 0 (best-effort)
    bool isOpen() const { return open_; }
    const StreamChoice& choice() const { return choice_; }
    IsoStats stats() const;

  private:
    std::unique_ptr<UsbDeviceIo> io_;
    std::unique_ptr<IsoStreamer> streamer_;
    StreamChoice choice_;
    IsoStats lastStats_;  // statistik terakhir sebelum streamer di-reset
    bool open_ = false;
};

}  // namespace pristine::usb
