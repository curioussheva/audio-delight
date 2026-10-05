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
    BLUETOOTH,          // A2DP / SCO
    USB_AUDIO,          // DAC USB - satu-satunya yang bisa jalur langsung
    HDMI,               // termasuk eARC
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
        case DeviceType::BUILTIN_SPEAKER: return "speaker";
        case DeviceType::BUILTIN_EARPIECE:return "earpiece";
        case DeviceType::TELEPHONY:       return "telephony";
        case DeviceType::UNKNOWN:         return "unknown";
    }
    return "unknown";
}

} // namespace pristine
