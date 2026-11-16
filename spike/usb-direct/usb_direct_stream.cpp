// =====================================================
// spike/usb-direct/usb_direct_stream.cpp
// =====================================================
//
// Implementasi streaming isochronous + setup UAC2. Lihat
// usb_direct_stream.h untuk kontraknya.
//
// Poin-poin yang mudah salah (sudah diverifikasi ke sumbernya):
//  - Claim interface: urutan yang benar adalah DISCONNECT_CLAIM dulu
//    (lepas driver kernel, mis. snd-usb-audio) baru CLAIMINTERFACE.
//    DISCONNECT_CLAIM HANYA melepas driver — tidak ikut claim (ini
//    perilaku libusb; diverifikasi di device nanti, lihat README).
//    ENODEV dari DISCONNECT_CLAIM = tidak ada driver terikat, lanjut.
//  - Worker memakai REAPURBNDELAY (non-blocking) + tidur 1 ms bila
//    antrean kosong. Blocking REAPURB + DISCARDURB sebagai wakeup
//    adalah desain produksi yang benar, tapi butuh penanganan race
//    stop() yang lebih rumit — ditunda sampai integrasi (lihat README).
//  - URB isochronous: buffer_length = jumlah panjang paket; tiap
//    iso_frame_desc[i].length = byte paket itu. Dengan ISO_ASAP kernel
//    yang memilih start_frame.
//
// SPDX-License-Identifier: MIT

#include "usb_direct_stream.h"

#include <cerrno>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <thread>

#include <sys/ioctl.h>
#include <unistd.h>

#include "usbdevfs.h"

namespace pristine::usb {
namespace {

constexpr uint8_t kUac2SetCur = 0x01;
constexpr uint8_t kUac2GetRange = 0x02;
constexpr uint8_t kUac2ClockFreqSelector = 0x01;

constexpr uint8_t kReqTypeClassIfaceOut = 0x21;
constexpr uint8_t kReqTypeClassIfaceIn = 0xA1;
constexpr uint8_t kReqTypeStdDeviceIn = 0x80;
constexpr uint8_t kReqGetDescriptor = 0x06;
constexpr uint16_t kDescTypeConfig = 0x02;

uint16_t readLe16(const uint8_t* p) { return static_cast<uint16_t>(p[0] | (p[1] << 8)); }
uint32_t readLe32(const uint8_t* p) {
    return static_cast<uint32_t>(p[0]) | (static_cast<uint32_t>(p[1]) << 8) |
           (static_cast<uint32_t>(p[2]) << 16) | (static_cast<uint32_t>(p[3]) << 24);
}
void writeLe32(uint8_t* p, uint32_t v) {
    p[0] = static_cast<uint8_t>(v & 0xFF);
    p[1] = static_cast<uint8_t>((v >> 8) & 0xFF);
    p[2] = static_cast<uint8_t>((v >> 16) & 0xFF);
    p[3] = static_cast<uint8_t>((v >> 24) & 0xFF);
}

}  // namespace

// =====================================================
// UsbdevfsIo (backend nyata)
// =====================================================

int UsbdevfsIo::controlTransfer(uint8_t reqType, uint8_t request, uint16_t value,
                                uint16_t index, uint8_t* data, uint16_t len,
                                uint32_t timeoutMs) {
    usbdevfs_ctrltransfer t{};
    t.bRequestType = reqType;
    t.bRequest = request;
    t.wValue = value;
    t.wIndex = index;
    t.wLength = len;
    t.timeout = timeoutMs;
    t.data = data;
    const int rc = ::ioctl(fd_, USBDEVFS_CONTROL, &t);
    if (rc < 0) return -errno;
    return rc;
}

UsbSpeed UsbdevfsIo::speed() {
    const int rc = ::ioctl(fd_, USBDEVFS_GET_SPEED);
    if (rc < 0) return UsbSpeed::kUnknown;
    switch (rc) {
        case 1: return UsbSpeed::kLow;
        case 2: return UsbSpeed::kFull;
        case 3: return UsbSpeed::kHigh;
        case 5: return UsbSpeed::kSuper;
        case 6: return UsbSpeed::kSuperPlus;
        default: return UsbSpeed::kUnknown;
    }
}

int UsbdevfsIo::claimInterface(int iface) {
    // Langkah 1: lepas driver kernel yang terikat (biasanya snd-usb-audio),
    // secara race-free. EXCEPT_DRIVER "usbfs": lepas driver apa pun
    // KECUALI usbfs sendiri.
    usbdevfs_disconnect_claim dc{};
    dc.interface = static_cast<unsigned int>(iface);
    dc.flags = USBDEVFS_DISCONNECT_CLAIM_EXCEPT_DRIVER;
    std::strncpy(dc.driver, "usbfs", sizeof(dc.driver) - 1);
    int rc = ::ioctl(fd_, USBDEVFS_DISCONNECT_CLAIM, &dc);
    if (rc < 0) {
        const int e = errno;
        if (e == ENODEV) {
            // Tidak ada driver terikat — lanjut ke claim.
        } else if (e == ENOTTY || e == EINVAL) {
            // Kernel lama tanpa DISCONNECT_CLAIM — fallback di bawah.
        } else {
            return -e;
        }
    }
    // Langkah 2: claim.
    const unsigned int ifnum = static_cast<unsigned int>(iface);
    rc = ::ioctl(fd_, USBDEVFS_CLAIMINTERFACE, &ifnum);
    if (rc == 0) return 0;
    if (errno == EBUSY) {
        // Driver kernel masih pegang interface (kernel lama / race):
        // lepas paksa lalu claim sekali lagi.
        if (::ioctl(fd_, USBDEVFS_DISCONNECT, &ifnum) == 0 &&
            ::ioctl(fd_, USBDEVFS_CLAIMINTERFACE, &ifnum) == 0) {
            return 0;
        }
    }
    return -errno;
}

int UsbdevfsIo::releaseInterface(int iface) {
    const unsigned int ifnum = static_cast<unsigned int>(iface);
    const int rc = ::ioctl(fd_, USBDEVFS_RELEASEINTERFACE, &ifnum);
    return rc == 0 ? 0 : -errno;
}

int UsbdevfsIo::setInterface(int iface, int alt) {
    usbdevfs_setinterface s{};
    s.interface = static_cast<unsigned int>(iface);
    s.altsetting = static_cast<unsigned int>(alt);
    const int rc = ::ioctl(fd_, USBDEVFS_SETINTERFACE, &s);
    return rc == 0 ? 0 : -errno;
}

int UsbdevfsIo::submitUrb(void* urb) {
    const int rc = ::ioctl(fd_, USBDEVFS_SUBMITURB, urb);
    return rc == 0 ? 0 : -errno;
}

int UsbdevfsIo::reapUrb(void** urb, bool block) {
    const int rc = ::ioctl(fd_, block ? USBDEVFS_REAPURB : USBDEVFS_REAPURBNDELAY, urb);
    if (rc < 0) return -errno;
    return 0;
}

int UsbdevfsIo::discardUrb(void* urb) {
    const int rc = ::ioctl(fd_, USBDEVFS_DISCARDURB, urb);
    return rc == 0 ? 0 : -errno;
}

// =====================================================
// MockUsbIo (backend host)
// =====================================================

MockUsbIo::MockUsbIo(std::vector<uint8_t> configBlob, std::vector<ClockRange> ranges)
    : configBlob_(std::move(configBlob)), ranges_(std::move(ranges)) {}

int MockUsbIo::controlTransfer(uint8_t reqType, uint8_t request, uint16_t value,
                               uint16_t index, uint8_t* data, uint16_t len,
                               uint32_t /*timeoutMs*/) {
    if (reqType == kReqTypeStdDeviceIn && request == kReqGetDescriptor &&
        ((value >> 8) & 0xFF) == kDescTypeConfig) {
        // GET_DESCRIPTOR (config): salin dari blob canned.
        const size_t n = std::min<size_t>(len, configBlob_.size());
        if (data != nullptr && n > 0) std::memcpy(data, configBlob_.data(), n);
        return static_cast<int>(n);
    }
    if (reqType == kReqTypeClassIfaceIn && request == kUac2GetRange &&
        ((value >> 8) & 0xFF) == kUac2ClockFreqSelector) {
        // GET_RANGE clock: wNumSubRanges + N x {min,max,res}.
        const size_t need = 2 + ranges_.size() * 12;
        if (len < need || data == nullptr) return -EINVAL;
        data[0] = static_cast<uint8_t>(ranges_.size() & 0xFF);
        data[1] = static_cast<uint8_t>((ranges_.size() >> 8) & 0xFF);
        for (size_t i = 0; i < ranges_.size(); ++i) {
            writeLe32(data + 2 + i * 12 + 0, ranges_[i].minHz);
            writeLe32(data + 2 + i * 12 + 4, ranges_[i].maxHz);
            writeLe32(data + 2 + i * 12 + 8, ranges_[i].resHz);
        }
        return static_cast<int>(need);
    }
    if (reqType == kReqTypeClassIfaceOut && request == kUac2SetCur &&
        ((value >> 8) & 0xFF) == kUac2ClockFreqSelector) {
        // SET_CUR clock: catat laju + clock id.
        if (data == nullptr || len < 4) return -EINVAL;
        lastSetRate_ = readLe32(data);
        lastSetClockId_ = (index >> 8) & 0xFF;
        return static_cast<int>(len);
    }
    return -EINVAL;
}

int MockUsbIo::claimInterface(int iface) {
    std::lock_guard<std::mutex> lock(mu_);
    claimCalled_ = true;
    claimedIface_ = iface;
    return 0;
}

int MockUsbIo::releaseInterface(int /*iface*/) { return 0; }

int MockUsbIo::setInterface(int iface, int alt) {
    std::lock_guard<std::mutex> lock(mu_);
    (void)iface;
    setIfaceAlt_ = alt;
    return 0;
}

int MockUsbIo::submitUrb(void* urb) {
    auto* u = static_cast<usbdevfs_urb*>(urb);
    // "Selesai seketika": semua paket sukses penuh.
    u->status = 0;
    u->actual_length = u->buffer_length;
    u->error_count = 0;
    for (int i = 0; i < u->number_of_packets; ++i) {
        u->iso_frame_desc[i].status = 0;
        u->iso_frame_desc[i].actual_length = u->iso_frame_desc[i].length;
    }
    {
        std::lock_guard<std::mutex> lock(mu_);
        completed_.push_back(urb);
        ++submitCount_;
    }
    cv_.notify_one();
    return 0;
}

int MockUsbIo::reapUrb(void** urb, bool block) {
    std::unique_lock<std::mutex> lock(mu_);
    if (completed_.empty()) {
        if (!block) return -EAGAIN;
        wake_ = false;
        cv_.wait(lock, [this] { return !completed_.empty() || wake_; });
        if (completed_.empty()) {
            wake_ = false;
            return -EAGAIN;
        }
    }
    *urb = completed_.front();
    completed_.erase(completed_.begin());
    return 0;
}

int MockUsbIo::discardUrb(void* urb) {
    // Emulasikan perilaku kernel: URB yang di-discard TETAP kembali
    // lewat reap (dengan status error), bukan menghilang. Kalau
    // dihapus dari antrean, worker tidak pernah melihatnya lagi dan
    // inFlight_ tidak pernah mencapai 0 -> join() menggantung.
    std::lock_guard<std::mutex> lock(mu_);
    auto* u = static_cast<usbdevfs_urb*>(urb);
    for (void* p : completed_) {
        if (p == urb) {
            u->status = -ECONNRESET;
            u->actual_length = 0;
            for (int i = 0; i < u->number_of_packets; ++i) {
                u->iso_frame_desc[i].status = -ECONNRESET;
                u->iso_frame_desc[i].actual_length = 0;
            }
            break;
        }
    }
    wake_ = true;
    cv_.notify_all();
    return 0;
}

// =====================================================
// Fungsi setup (backend-agnostic)
// =====================================================

int readConfigDescriptor(UsbDeviceIo& io, uint8_t* buf, size_t cap) {
    if (buf == nullptr || cap < 9) return -EINVAL;
    uint8_t head[9] = {};
    int rc = io.controlTransfer(kReqTypeStdDeviceIn, kReqGetDescriptor,
                                static_cast<uint16_t>(kDescTypeConfig << 8), 0, head, 9, 1000);
    if (rc < 0) return rc;
    if (rc < 9) return -EIO;
    const uint16_t total = readLe16(head + 2);
    if (total < 9 || total > cap) return -EINVAL;
    rc = io.controlTransfer(kReqTypeStdDeviceIn, kReqGetDescriptor,
                            static_cast<uint16_t>(kDescTypeConfig << 8), 0, buf, total, 1000);
    if (rc < 0) return rc;
    if (rc < total) return -EIO;
    return rc;
}

int queryClockRates(UsbDeviceIo& io, uint8_t interfaceNumber, uint8_t clockId,
                    ClockRange* out, int maxOut) {
    if (out == nullptr || maxOut <= 0) return -EINVAL;
    // GET_RANGE: respons bisa besar (banyak sub-range); 256 byte cukup
    // untuk puluhan range.
    uint8_t resp[256] = {};
    const uint16_t wValue = static_cast<uint16_t>(kUac2ClockFreqSelector << 8);
    const uint16_t wIndex =
        static_cast<uint16_t>((static_cast<uint16_t>(clockId) << 8) | interfaceNumber);
    const int rc = io.controlTransfer(kReqTypeClassIfaceIn, kUac2GetRange, wValue, wIndex,
                                      resp, sizeof(resp), 1000);
    if (rc < 0) return rc;
    if (rc < 2) return -EIO;
    const int n = readLe16(resp);
    if (n <= 0) return -EIO;
    if (rc < 2 + n * 12) return -EIO;
    const int count = std::min(n, maxOut);
    for (int i = 0; i < count; ++i) {
        out[i].minHz = readLe32(resp + 2 + i * 12 + 0);
        out[i].maxHz = readLe32(resp + 2 + i * 12 + 4);
        out[i].resHz = readLe32(resp + 2 + i * 12 + 8);
    }
    return count;
}

bool rateSupported(const ClockRange* ranges, int count, uint32_t rate) {
    if (ranges == nullptr) return false;
    for (int i = 0; i < count; ++i) {
        if (rate < ranges[i].minHz || rate > ranges[i].maxHz) continue;
        if (ranges[i].resHz == 0) return rate == ranges[i].minHz;
        if ((rate - ranges[i].minHz) % ranges[i].resHz == 0) return true;
    }
    return false;
}

int setClockFrequency(UsbDeviceIo& io, uint8_t interfaceNumber, uint8_t clockId,
                      uint32_t rate) {
    uint8_t data[4] = {};
    writeLe32(data, rate);
    const uint16_t wValue = static_cast<uint16_t>(kUac2ClockFreqSelector << 8);
    const uint16_t wIndex =
        static_cast<uint16_t>((static_cast<uint16_t>(clockId) << 8) | interfaceNumber);
    const int rc = io.controlTransfer(kReqTypeClassIfaceOut, kUac2SetCur, wValue, wIndex,
                                      data, sizeof(data), 1000);
    if (rc < 0) return rc;
    return 0;
}

// =====================================================
// IsoStreamer
// =====================================================

IsoStreamer::IsoStreamer(UsbDeviceIo& io, const StreamChoice& choice, int numUrbs,
                         int packetsPerUrb)
    : io_(io), choice_(choice), numUrbs_(numUrbs), packetsPerUrb_(packetsPerUrb) {
    const UsbSpeed speed = io_.speed();
    const double fpp =
        framesPerIsoPacket(choice.format.sampleRate, choice.interval, speed);
    acc_ = IsoFrameAccumulator(fpp);
    const uint32_t worstFrames = static_cast<uint32_t>(std::ceil(fpp));
    const int maxPacketBytes =
        static_cast<int>(worstFrames * choice.format.bytesPerFrame());
    // Slot disimpan sebagai unique_ptr: Slot berisi std::atomic (tidak
    // bisa di-move), jadi vector<Slot> tidak bisa di-resize.
    slots_.reserve(numUrbs_);
    for (int i = 0; i < numUrbs_; ++i) {
        auto slot = std::make_unique<Slot>();
        slot->bufferBytes = maxPacketBytes * packetsPerUrb_;
        slot->buffer = static_cast<uint8_t*>(std::malloc(slot->bufferBytes));
        const size_t urbSize = sizeof(usbdevfs_urb) +
                               static_cast<size_t>(packetsPerUrb_) * sizeof(usbdevfs_iso_packet_desc);
        slot->urb = std::malloc(urbSize);
        slots_.push_back(std::move(slot));
    }
}

IsoStreamer::~IsoStreamer() {
    stop();
    for (auto& slot : slots_) {
        std::free(slot->urb);
        std::free(slot->buffer);
    }
}

bool IsoStreamer::refill(Slot& slot) {
    auto* urb = static_cast<usbdevfs_urb*>(slot.urb);
    const uint16_t bpf = choice_.format.bytesPerFrame();
    size_t offset = 0;
    int totalBytes = 0;
    for (int i = 0; i < packetsPerUrb_; ++i) {
        const int frames = acc_.nextFrames();
        const int want = frames * bpf;
        size_t got = 0;
        if (source_ && want > 0) {
            got = source_(slot.buffer + offset, static_cast<size_t>(want));
        }
        if (got < static_cast<size_t>(want)) {
            // Underrun: kirim silence untuk sisa paket (DAC tetap diberi
            // makan; jangan putus aliran isochronous).
            {
                std::lock_guard<std::mutex> lock(statsMu_);
                ++stats_.underruns;
            }
            std::memset(slot.buffer + offset + got, 0, static_cast<size_t>(want) - got);
        }
        urb->iso_frame_desc[i].length = static_cast<unsigned int>(want);
        urb->iso_frame_desc[i].status = 0;
        urb->iso_frame_desc[i].actual_length = 0;
        offset += static_cast<size_t>(want);
        totalBytes += want;
        {
            std::lock_guard<std::mutex> lock(statsMu_);
            stats_.framesSent += static_cast<uint64_t>(frames);
        }
    }
    urb->buffer = slot.buffer;
    urb->buffer_length = totalBytes;
    urb->actual_length = 0;
    urb->status = 0;
    urb->error_count = 0;
    return true;
}

int IsoStreamer::start(PcmSource source) {
    if (running_.load()) return -EBUSY;
    if (!source) return -EINVAL;
    source_ = std::move(source);
    stopping_.store(false);

    for (size_t i = 0; i < slots_.size(); ++i) {
        auto& slot = *slots_[i];
        if (slot.urb == nullptr || slot.buffer == nullptr) return -ENOMEM;
        auto* urb = static_cast<usbdevfs_urb*>(slot.urb);
        std::memset(urb, 0, sizeof(usbdevfs_urb) +
                               static_cast<size_t>(packetsPerUrb_) * sizeof(usbdevfs_iso_packet_desc));
        urb->type = USBDEVFS_URB_TYPE_ISO;
        urb->endpoint = choice_.endpointAddress;
        urb->flags = USBDEVFS_URB_ISO_ASAP;
        urb->number_of_packets = packetsPerUrb_;
        urb->usercontext = reinterpret_cast<void*>(static_cast<intptr_t>(i));
        refill(slot);
        const int rc = io_.submitUrb(slot.urb);
        if (rc != 0) {
            // Gagal di tengah jalan: discard URB yang sudah disubmit
            // sebelum keluar — JANGAN free memori URB yang masih
            // dipegang kernel.
            for (size_t j = 0; j < i; ++j) {
                if (slots_[j]->submitted.load()) {
                    io_.discardUrb(slots_[j]->urb);
                    slots_[j]->submitted.store(false);
                    inFlight_.fetch_sub(1);
                }
            }
            return rc;
        }
        slot.submitted.store(true);
        inFlight_.fetch_add(1);
        {
            std::lock_guard<std::mutex> lock(statsMu_);
            ++stats_.urbsSubmitted;
        }
    }
    running_.store(true);
    worker_ = std::thread(&IsoStreamer::workerLoop, this);
    return 0;
}

void IsoStreamer::workerLoop() {
    while (true) {
        void* raw = nullptr;
        const int rc = io_.reapUrb(&raw, false);  // non-blocking + tidur 1 ms
        if (rc == -EAGAIN) {
            if (stopping_.load() && inFlight_.load() == 0) break;
            std::this_thread::sleep_for(std::chrono::milliseconds(1));
            continue;
        }
        if (rc != 0 || raw == nullptr) {
            std::lock_guard<std::mutex> lock(statsMu_);
            ++stats_.urbErrors;
            if (stopping_.load() && inFlight_.load() == 0) break;
            continue;
        }
        auto* urb = static_cast<usbdevfs_urb*>(raw);
        const auto slotIdx = static_cast<size_t>(reinterpret_cast<intptr_t>(urb->usercontext));
        inFlight_.fetch_sub(1);
        {
            std::lock_guard<std::mutex> lock(statsMu_);
            ++stats_.urbsCompleted;
            // URB yang kembali sesudah stop() diminta adalah hasil
            // DISCARDURB (status -ECONNRESET) — itu penutupan normal,
            // bukan error.
            const bool stopping = stopping_.load();
            if (urb->status != 0) {
                if (!stopping) ++stats_.urbErrors;
            } else {
                for (int i = 0; i < urb->number_of_packets; ++i) {
                    const auto& p = urb->iso_frame_desc[i];
                    if (p.status != 0) {
                        ++stats_.urbErrors;
                    } else {
                        ++stats_.packetsCompleted;
                        stats_.bytesSent += p.actual_length;
                        if (p.actual_length < p.length) ++stats_.shortPackets;
                    }
                }
            }
        }
        if (slotIdx < slots_.size()) {
            slots_[slotIdx]->submitted.store(false);
        }
        if (stopping_.load()) {
            if (inFlight_.load() == 0) break;
            continue;  // jangan submit lagi
        }
        if (slotIdx < slots_.size()) {
            auto& slot = *slots_[slotIdx];
            refill(slot);
            const int src = io_.submitUrb(slot.urb);
            if (src == 0) {
                slot.submitted.store(true);
                inFlight_.fetch_add(1);
                std::lock_guard<std::mutex> lock(statsMu_);
                ++stats_.urbsSubmitted;
            } else {
                std::lock_guard<std::mutex> lock(statsMu_);
                ++stats_.urbErrors;
            }
        }
    }
    running_.store(false);
}

void IsoStreamer::stop() {
    if (!running_.load() && !worker_.joinable()) {
        // Worker tidak pernah jalan (mis. start() gagal): tetap discard
        // URB yang mungkin masih in flight sebelum memori dibebaskan.
        for (auto& slot : slots_) {
            if (slot->submitted.load() && slot->urb != nullptr) {
                io_.discardUrb(slot->urb);
                slot->submitted.store(false);
            }
        }
        return;
    }
    stopping_.store(true);
    for (auto& slot : slots_) {
        if (slot->submitted.load() && slot->urb != nullptr) {
            io_.discardUrb(slot->urb);
            slot->submitted.store(false);
        }
    }
    if (worker_.joinable()) worker_.join();
    running_.store(false);
}

IsoStats IsoStreamer::stats() const {
    std::lock_guard<std::mutex> lock(statsMu_);
    return stats_;
}

// =====================================================
// UsbDirectDevice
// =====================================================

int UsbDirectDevice::open(uint32_t wantedRate, uint8_t channels, uint8_t subslot,
                          uint8_t bitRes, char* err, size_t errLen) {
    auto fail = [&](const char* msg) -> int {
        if (err != nullptr && errLen > 0) std::snprintf(err, errLen, "%s", msg);
        return -ENODEV;
    };

    uint8_t blob[4096] = {};
    const int blobLen = readConfigDescriptor(*io_, blob, sizeof(blob));
    if (blobLen < 0) return fail("gagal baca deskriptor konfigurasi (control transfer)");
    if (blobLen < 9) return fail("deskriptor konfigurasi terlalu pendek");

    const ParseResult parsed =
        parseConfigDescriptor(blob, static_cast<size_t>(blobLen), wantedRate, channels,
                              subslot, bitRes);
    if (!parsed.ok) {
        if (err != nullptr && errLen > 0) {
            std::snprintf(err, errLen, "parse deskriptor: %s", parsed.error);
        }
        return -ENODEV;
    }
    choice_ = parsed.choice;

    if (choice_.clockSourceId == 0) {
        return fail("tidak ada CLOCK_SOURCE di deskriptor — laju tidak bisa diverifikasi/diatur");
    }
    ClockRange ranges[16];
    const int nRanges =
        queryClockRates(*io_, choice_.interfaceNumber, choice_.clockSourceId, ranges, 16);
    if (nRanges < 0) return fail("GET_RANGE clock source gagal");
    if (!rateSupported(ranges, nRanges, wantedRate)) {
        if (err != nullptr && errLen > 0) {
            std::snprintf(err, errLen, "laju %u Hz tidak didukung clock source", wantedRate);
        }
        return -ENODEV;
    }

    char fitErr[128] = {};
    const UsbSpeed speed = io_->speed();
    if (!packetFits(wantedRate, choice_.interval, speed, choice_.format,
                    choice_.maxPacketSize, fitErr, sizeof(fitErr))) {
        if (err != nullptr && errLen > 0) {
            std::snprintf(err, errLen, "paket tidak muat: %s", fitErr);
        }
        return -ENODEV;
    }

    int rc = io_->claimInterface(choice_.interfaceNumber);
    if (rc != 0) return fail("claim interface gagal (driver kernel tidak bisa dilepas?)");
    rc = io_->setInterface(choice_.interfaceNumber, choice_.altSetting);
    if (rc != 0) {
        io_->releaseInterface(choice_.interfaceNumber);
        return fail("SET_INTERFACE gagal");
    }
    rc = setClockFrequency(*io_, choice_.interfaceNumber, choice_.clockSourceId, wantedRate);
    if (rc != 0) {
        io_->setInterface(choice_.interfaceNumber, 0);
        io_->releaseInterface(choice_.interfaceNumber);
        return fail("SET_CUR clock frequency gagal");
    }
    open_ = true;
    return 0;
}

int UsbDirectDevice::startStreaming(PcmSource source) {
    if (!open_) return -ENODEV;
    if (streamer_) return -EBUSY;
    streamer_ = std::make_unique<IsoStreamer>(*io_, choice_);
    return streamer_->start(std::move(source));
}

void UsbDirectDevice::stopStreaming() {
    if (streamer_) {
        streamer_->stop();
        lastStats_ = streamer_->stats();
        streamer_.reset();
    }
}

void UsbDirectDevice::close() {
    stopStreaming();
    if (open_) {
        io_->setInterface(choice_.interfaceNumber, 0);  // best-effort
        io_->releaseInterface(choice_.interfaceNumber);
        open_ = false;
    }
}

IsoStats UsbDirectDevice::stats() const {
    if (streamer_) return streamer_->stats();
    return lastStats_;
}

}  // namespace pristine::usb
