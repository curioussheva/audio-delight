#include "NoisyReceiverHandler.h"
#include <android/log.h>

#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, "NoisyReceiver", __VA_ARGS__)

namespace pristine {

NoisyReceiverHandler& NoisyReceiverHandler::get() {
    static NoisyReceiverHandler instance;
    return instance;
}

void NoisyReceiverHandler::registerNoisyCallback(std::function<void()> callback) {
    (void)callback;
    LOGD("registerNoisyCallback stub");
}

void NoisyReceiverHandler::startListening() {
    LOGD("startListening stub");
}

void NoisyReceiverHandler::stopListening() {
    LOGD("stopListening stub");
}

} // namespace pristine