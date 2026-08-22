#pragma once
#include "AudioDeviceDescriptor.h"
#include "DeviceCapabilities.h"
#include <vector>
#include <functional>

namespace pristine {

class AudioDeviceManager {
public:
    static AudioDeviceManager& get();
    void refreshDevices();
    std::vector<AudioDeviceDescriptor> getAvailableDevices() const;
    bool setActiveDevice(const std::string& deviceId);
    AudioDeviceDescriptor getActiveDevice() const;
    DeviceCapabilities getDeviceCapabilities(const std::string& deviceId) const;
    void onDevicePlugged(std::function<void(const AudioDeviceDescriptor&)> callback);
    void onDeviceUnplugged(std::function<void(const std::string&)> callback);

private:
    AudioDeviceManager() = default;
};

} // namespace pristine