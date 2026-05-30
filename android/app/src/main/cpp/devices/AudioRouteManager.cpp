#include "AudioRouteManager.h"
#include <android/log.h>

#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, "AudioRouteManager", __VA_ARGS__)

namespace audio {

AudioRouteManager& AudioRouteManager::get() {
    static AudioRouteManager instance;
    return instance;
}

bool AudioRouteManager::setRoute(const std::string& deviceId) {
    LOGD("setRoute(%s) - stub", deviceId.c_str());
    return true;
}

AudioDeviceInfo AudioRouteManager::getCurrentRoute() const {
    return AudioDeviceInfo{};
}

void AudioRouteManager::registerRouteChangeCallback(std::function<void(const AudioDeviceInfo&)> callback) {
    // stub
}

} // namespace audio