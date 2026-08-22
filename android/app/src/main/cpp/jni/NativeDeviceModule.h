#pragma once
#include <jni.h>

#ifdef __cplusplus
extern "C" {
#endif

JNIEXPORT jobjectArray JNICALL Java_com_pristineaudio_audio_NativeDeviceModule_nativeGetDevices(JNIEnv*, jobject);
JNIEXPORT jboolean JNICALL Java_com_pristineaudio_audio_NativeDeviceModule_nativeSetActiveDevice(JNIEnv*, jobject, jstring);

#ifdef __cplusplus
}
#endif
