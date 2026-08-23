#include <jni.h>
#include "NativePlaybackModule.h"
#include "manager/EngineManager.h"

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void* reserved) {
    // Inisialisasi playback controller
    initPlaybackModule(&pristine::EngineManager::get().playback());
    return JNI_VERSION_1_6;
}