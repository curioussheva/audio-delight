#pragma once
#include "AudioDeviceInfo.h"
#include <functional>

namespace audio {

class AudioRouteManager {
public:
    static AudioRouteManager& get();
    bool setRoute(const std::string& deviceId);
    AudioDeviceInfo getCurrentRoute() const;
    void registerRouteChangeCallback(std::function<void(const AudioDeviceInfo&)> callback);
private:
    AudioRouteManager() = default;
};

} // namespace audio