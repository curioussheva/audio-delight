#include "NativeDeviceModule.h"
#include "devices/AudioDeviceManager.h"
#include <vector>
#include <android/log.h>

extern "C" {

JNIEXPORT jobjectArray JNICALL Java_com_pristineaudio_audio_NativeDeviceModule_nativeGetDevices(JNIEnv* env, jobject) {
    auto& mgr = pristine::AudioDeviceManager::get();
    auto devices = mgr.getAvailableDevices();
    jclass deviceClass = env->FindClass("com/pristineaudio/audio/AudioDeviceInfo");
    // stub: return empty array
    return env->NewObjectArray(0, deviceClass, nullptr);
}

JNIEXPORT jboolean JNICALL Java_com_pristineaudio_audio_NativeDeviceModule_nativeSetActiveDevice(JNIEnv* env, jobject, jstring deviceId) {
    const char* id = env->GetStringUTFChars(deviceId, nullptr);
    bool ok = pristine::AudioDeviceManager::get().setActiveDevice(id);
    env->ReleaseStringUTFChars(deviceId, id);
    return ok ? JNI_TRUE : JNI_FALSE;
}

} // extern "C"