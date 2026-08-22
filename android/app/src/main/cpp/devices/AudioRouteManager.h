#pragma once
#include "AudioDeviceDescriptor.h"
#include <functional>

namespace pristine {

class AudioRouteManager {
public:
    static AudioRouteManager& get();
    bool setRoute(const std::string& deviceId);
    AudioDeviceDescriptor getCurrentRoute() const;
    void registerRouteChangeCallback(std::function<void(const AudioDeviceDescriptor&)> callback);
private:
    AudioRouteManager() = default;
};

} // namespace pristine