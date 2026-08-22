#include "AudioDeviceManager.h"
#include <android/log.h>

#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, "AudioDeviceManager", __VA_ARGS__)

namespace pristine {

AudioDeviceManager& AudioDeviceManager::get() {
    static AudioDeviceManager instance;
    return instance;
}

void AudioDeviceManager::refreshDevices() {
    LOGD("refreshDevices - stub");
}

std::vector<AudioDeviceDescriptor> AudioDeviceManager::getAvailableDevices() const {
    return {}; // empty
}

bool AudioDeviceManager::setActiveDevice(const std::string& deviceId) {
    LOGD("setActiveDevice(%s) - stub", deviceId.c_str());
    return true;
}

AudioDeviceDescriptor AudioDeviceManager::getActiveDevice() const {
    return AudioDeviceDescriptor{};
}

DeviceCapabilities AudioDeviceManager::getDeviceCapabilities(const std::string& deviceId) const {
    return DeviceCapabilities{};
}

void AudioDeviceManager::onDevicePlugged(std::function<void(const AudioDeviceDescriptor&)> callback) {
    // stub
}

void AudioDeviceManager::onDeviceUnplugged(std::function<void(const std::string&)> callback) {
    // stub
}

} // namespace pristine