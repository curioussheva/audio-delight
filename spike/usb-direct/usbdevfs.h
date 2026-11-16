// =====================================================
// spike/usb-direct/usbdevfs.h
// =====================================================
//
// Pembungkus tipis atas Linux usbdevfs (<linux/usbdevice_fs.h>).
//
// Kalau header sistem tersedia (host Linux, dan NDK yang menyertakannya),
// pakai header itu. Kalau TIDAK tersedia, pakai definisi fallback di bawah
// — subset yang dipakai spike ini saja, nilainya DIVERIFIKASI terhadap
// /usr/include/linux/usbdevice_fs.h di host (Ubuntu 24.04, g++ 13.3,
// 2026-11-16). JANGAN ubah angka-angka ini dari ingatan; cek ulang ke
// header kernel bila ragu.
//
// Catatan yang penting dan mudah salah:
//  - USBDEVFS_URB_ISO_ASAP = 0x02 (BUKAN 0x01; 0x01 adalah SHORT_NOT_OK).
//  - USBDEVFS_SUBMITURB = _IOR('U', 10, ...); CLAIMINTERFACE = 15,
//    RELEASEINTERFACE = 16 (BUKAN 9/10 — itu nomor dari header lama).
//  - USBDEVFS_GETDESCRIPTOR / SETDESCRIPTOR TIDAK ADA lagi di header
//    kernel modern — baca deskriptor lewat control transfer
//    (USBDEVFS_CONTROL, GET_DESCRIPTOR) saja.
//  - USBDEVFS_GET_SPEED = _IO('U', 31) (BUKAN 26; 26 adalah
//    GET_CAPABILITIES).
//
// SPDX-License-Identifier: MIT
// (Angka ioctl + layout struct adalah fakta dari header UAPI kernel;
//  file ini ditulis ulang sendiri, bukan salinan header tersebut.)

#pragma once

#if defined(__has_include)
#  if __has_include(<linux/usbdevice_fs.h>)
#    include <linux/usbdevice_fs.h>
#    define USB_DIRECT_HAVE_USBDEVFS_H 1
#  endif
#endif

#ifndef USB_DIRECT_HAVE_USBDEVFS_H

#include <cstdint>
#include <sys/ioctl.h>

// --- URB flags / types (terverifikasi vs host header) ---
#define USBDEVFS_URB_SHORT_NOT_OK 0x01
#define USBDEVFS_URB_ISO_ASAP 0x02
#define USBDEVFS_URB_BULK_CONTINUATION 0x04
#define USBDEVFS_URB_NO_FSBR 0x20
#define USBDEVFS_URB_ZERO_PACKET 0x40
#define USBDEVFS_URB_NO_INTERRUPT 0x80

#define USBDEVFS_URB_TYPE_ISO 0
#define USBDEVFS_URB_TYPE_INTERRUPT 1
#define USBDEVFS_URB_TYPE_CONTROL 2
#define USBDEVFS_URB_TYPE_BULK 3

// --- Disconnect-claim flags ---
#define USBDEVFS_DISCONNECT_CLAIM_IF_DRIVER 0x01
#define USBDEVFS_DISCONNECT_CLAIM_EXCEPT_DRIVER 0x02

// --- Struct yang dipakai spike (layout ABI sama dengan UAPI) ---
struct usbdevfs_ctrltransfer {
    uint8_t bRequestType;
    uint8_t bRequest;
    uint16_t wValue;
    uint16_t wIndex;
    uint16_t wLength;
    uint32_t timeout;  // ms
    void* data;
};

struct usbdevfs_setinterface {
    unsigned int interface;
    unsigned int altsetting;
};

struct usbdevfs_iso_packet_desc {
    unsigned int length;
    unsigned int actual_length;
    unsigned int status;
};

struct usbdevfs_urb {
    unsigned char type;
    unsigned char endpoint;
    int status;
    unsigned int flags;
    void* buffer;
    int buffer_length;
    int actual_length;
    int start_frame;
    union {
        int number_of_packets;    // hanya URB isochronous
        unsigned int stream_id;   // hanya bulk streams
    };
    int error_count;
    unsigned int signr;
    void* usercontext;
    struct usbdevfs_iso_packet_desc iso_frame_desc[];
};

// --- Ioctl yang dipakai spike ---
#define USBDEVFS_CONTROL _IOWR('U', 0, struct usbdevfs_ctrltransfer)
#define USBDEVFS_RESETEP _IOR('U', 3, unsigned int)
#define USBDEVFS_SETINTERFACE _IOR('U', 4, struct usbdevfs_setinterface)
#define USBDEVFS_SETCONFIGURATION _IOR('U', 5, unsigned int)
#define USBDEVFS_SUBMITURB _IOR('U', 10, struct usbdevfs_urb)
#define USBDEVFS_DISCARDURB _IO('U', 11)
#define USBDEVFS_REAPURB _IOW('U', 12, void*)
#define USBDEVFS_REAPURBNDELAY _IOW('U', 13, void*)
#define USBDEVFS_CLAIMINTERFACE _IOR('U', 15, unsigned int)
#define USBDEVFS_RELEASEINTERFACE _IOR('U', 16, unsigned int)
#define USBDEVFS_RESET _IO('U', 20)
#define USBDEVFS_CLEAR_HALT _IOR('U', 21, unsigned int)
#define USBDEVFS_DISCONNECT _IO('U', 22)
#define USBDEVFS_CONNECT _IO('U', 23)
#define USBDEVFS_DISCONNECT_CLAIM _IOR('U', 27, struct usbdevfs_disconnect_claim)
#define USBDEVFS_GET_SPEED _IO('U', 31)

struct usbdevfs_disconnect_claim {
    unsigned int interface;
    unsigned int flags;
    char driver[256];
};

#endif  // !USB_DIRECT_HAVE_USBDEVFS_H
