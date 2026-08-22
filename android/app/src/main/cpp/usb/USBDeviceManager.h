#pragma once
#include <jni.h>
#include <functional>
#include <string>

namespace pristine {

class USBDeviceManager {
public:
    static USBDeviceManager& get();
    bool init(JNIEnv* env, jobject context);
    bool requestDevicePermission(int vendorId, int productId);
    bool openUSBStream(int sampleRate, int framesPerBurst);
    void closeUSBStream();
    void setOnDataReady(std::function<void(const float*, int32_t)> callback);
    void setOnError(std::function<void(const std::string&)> callback);

private:
    USBDeviceManager() = default;
};

} // namespace pristine