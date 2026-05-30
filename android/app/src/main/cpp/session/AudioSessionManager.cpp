#include "AudioSessionManager.h"
#include <android/log.h>

#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, "AudioSession", __VA_ARGS__)

namespace pristine {

AudioSessionManager& AudioSessionManager::get() {
    static AudioSessionManager instance;
    return instance;
}

bool AudioSessionManager::requestAudioFocus() {
    LOGD("requestAudioFocus stub");
    return true;
}

void AudioSessionManager::abandonAudioFocus() {
    LOGD("abandonAudioFocus stub");
}

void AudioSessionManager::setOnAudioFocusChange(std::function<void(int)> callback) {
    (void)callback;
}

} // namespace pristine