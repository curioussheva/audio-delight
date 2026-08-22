#include "AudioRouteManager.h"
#include <android/log.h>

#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, "AudioRouteManager", __VA_ARGS__)

namespace pristine {

AudioRouteManager& AudioRouteManager::get() {
    static AudioRouteManager instance;
    return instance;
}

bool AudioRouteManager::setRoute(const std::string& deviceId) {
    LOGD("setRoute(%s) - stub", deviceId.c_str());
    return true;
}

AudioDeviceDescriptor AudioRouteManager::getCurrentRoute() const {
    return AudioDeviceDescriptor{};
}

void AudioRouteManager::registerRouteChangeCallback(std::function<void(const AudioDeviceDescriptor&)> callback) {
    // stub
}

} // namespace pristine