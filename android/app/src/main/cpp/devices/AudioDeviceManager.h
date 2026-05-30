#pragma once
#include "AudioDeviceInfo.h"
#include "DeviceCapabilities.h"
#include <vector>
#include <functional>

namespace audio {

class AudioDeviceManager {
public:
    static AudioDeviceManager& get();
    void refreshDevices();
    std::vector<AudioDeviceInfo> getAvailableDevices() const;
    bool setActiveDevice(const std::string& deviceId);
    AudioDeviceInfo getActiveDevice() const;
    DeviceCapabilities getDeviceCapabilities(const std::string& deviceId) const;
    void onDevicePlugged(std::function<void(const AudioDeviceInfo&)> callback);
    void onDeviceUnplugged(std::function<void(const std::string&)> callback);

private:
    AudioDeviceManager() = default;
};

} // namespace audio