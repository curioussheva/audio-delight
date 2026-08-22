#include "USBDeviceManager.h"
#include <android/log.h>

#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, "USBDeviceManager", __VA_ARGS__)

namespace pristine {

USBDeviceManager& USBDeviceManager::get() {
    static USBDeviceManager instance;
    return instance;
}

bool USBDeviceManager::init(JNIEnv* env, jobject context) {
    LOGD("USBDeviceManager init - stub");
    return true;
}

bool USBDeviceManager::requestDevicePermission(int vendorId, int productId) {
    LOGD("requestDevicePermission vendor=%d product=%d - stub", vendorId, productId);
    return false;
}

bool USBDeviceManager::openUSBStream(int sampleRate, int framesPerBurst) {
    LOGD("openUSBStream sr=%d burst=%d - stub", sampleRate, framesPerBurst);
    return false;
}

void USBDeviceManager::closeUSBStream() {
    LOGD("closeUSBStream - stub");
}

void USBDeviceManager::setOnDataReady(std::function<void(const float*, int32_t)> callback) {}
void USBDeviceManager::setOnError(std::function<void(const std::string&)> callback) {}

} // namespace pristine