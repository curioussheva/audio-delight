#pragma once
#include "DeviceTypes.h"
#include <string>

namespace audio {

struct AudioDeviceInfo {
    std::string id;
    std::string name;
    DeviceType type;
    int32_t preferredSampleRate = 48000;
    bool supportsExclusive = false;
};

} // namespace audio