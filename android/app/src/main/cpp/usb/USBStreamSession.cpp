#include "USBStreamSession.h"
#include <android/log.h>

#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, "USBStreamSession", __VA_ARGS__)

namespace audio {

bool USBStreamSession::start(int sampleRate, int framesPerBurst) {
    LOGD("start session - stub");
    mActive = true;
    return true;
}

void USBStreamSession::stop() {
    mActive = false;
}

bool USBStreamSession::write(const float* data, int32_t numFrames) {
    return mActive;
}

bool USBStreamSession::isActive() const {
    return mActive;
}

} // namespace audio