#pragma once
#include <string>

namespace audio {

enum class DeviceType {
    WIRED_HEADSET,
    BLUETOOTH,
    USB_AUDIO,
    BUILTIN_SPEAKER,
    UNKNOWN
};

} // namespace audio