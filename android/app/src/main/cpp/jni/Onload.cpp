#include <jni.h>
#include "manager/EngineManager.h"
#include "NativePlaybackModule.h"

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void* reserved) {
    // Inisialisasi playback controller
    initPlaybackModule(&pristine::EngineManager::get().playback());
    return JNI_VERSION_1_6;
}