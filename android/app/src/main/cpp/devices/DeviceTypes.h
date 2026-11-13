#pragma once
#include <string>

namespace pristine {

// Jenis perangkat output audio.
//
// Nama anggota dibuat unik supaya tidak bertabrakan dengan makro/identifier
// umum (dulu ada `Speaker` sementara enum-nya `BUILTIN_SPEAKER`, itu bikin
// kode pemakainya tidak konsisten).
enum class DeviceType {
    WIRED_HEADSET,
    BLUETOOTH,          // A2DP / SCO / BLE (selalu lossy)
    USB_AUDIO,          // DAC USB - satu-satunya yang bisa jalur langsung
    HDMI,               // termasuk ARC (10) dan eARC (29)
    LINE_OUT,           // line-level analog/digital (mis. SPDIF) + dock analog
    BUILTIN_SPEAKER,
    BUILTIN_EARPIECE,   // speaker telepon
    TELEPHONY,          // routing panggilan
    UNKNOWN
};

inline const char* deviceTypeName(DeviceType t) {
    switch (t) {
        case DeviceType::WIRED_HEADSET:   return "headset";
        case DeviceType::BLUETOOTH:       return "bluetooth";
        case DeviceType::USB_AUDIO:       return "usb";
        case DeviceType::HDMI:            return "hdmi";
        case DeviceType::LINE_OUT:        return "line_out";
        case DeviceType::BUILTIN_SPEAKER: return "speaker";
        case DeviceType::BUILTIN_EARPIECE:return "earpiece";
        case DeviceType::TELEPHONY:       return "telephony";
        case DeviceType::UNKNOWN:         return "unknown";
    }
    return "unknown";
}

// B13-W2 (2026-11-14): tipe output MUSIK saja — yang layak tampil di
// daftar pemilih output ke JS. Yang dibuang:
//   - BUILTIN_EARPIECE (Android 1) — speaker telepon, bukan musik.
//   - TELEPHONY (Android 18) — routing panggilan.
//   - UNKNOWN — REMOTE_SUBMIX (25), BUS (21), USB_ACCESSORY (12, sejak
//     B13-W2 tidak lagi dipetakan ke USB_AUDIO), FM/tuner (14/16/17),
//     DOCK (13), MULTICHANNEL_GROUP (32), HEARING_AID (23), BLE_CENTRAL
//     (34/35), dsb. — bukan output musik biasa.
// Yang lolos: speaker (2/24), wired (3/4), line (5/6/31), Bluetooth
// (7/8/26/27/30/33), HDMI (9/10/29), USB DAC (11/22).
inline bool isMusicOutputDevice(DeviceType t) {
    switch (t) {
        case DeviceType::BUILTIN_SPEAKER:
        case DeviceType::WIRED_HEADSET:
        case DeviceType::LINE_OUT:
        case DeviceType::BLUETOOTH:
        case DeviceType::HDMI:
        case DeviceType::USB_AUDIO:
            return true;
        case DeviceType::BUILTIN_EARPIECE:
        case DeviceType::TELEPHONY:
        case DeviceType::UNKNOWN:
            return false;
    }
    return false;
}

} // namespace pristine
