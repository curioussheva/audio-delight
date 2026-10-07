#pragma once
#include <jni.h>

#ifdef __cplusplus
extern "C" {
#endif

JNIEXPORT jobjectArray JNICALL Java_com_pristineaudio_audio_NativeDeviceModule_nativeGetDevices(JNIEnv*, jobject);
JNIEXPORT jboolean JNICALL Java_com_pristineaudio_audio_NativeDeviceModule_nativeSetActiveDevice(JNIEnv*, jobject, jstring);
JNIEXPORT void JNICALL Java_com_pristineaudio_audio_NativeDeviceModule_nativeOnDeviceAdded(JNIEnv*, jobject, jstring);
JNIEXPORT void JNICALL Java_com_pristineaudio_audio_NativeDeviceModule_nativeOnDeviceRemoved(JNIEnv*, jobject, jstring);
JNIEXPORT jintArray JNICALL Java_com_pristineaudio_audio_NativeDeviceModule_nativeGetActiveDeviceStatus(JNIEnv*, jobject);
JNIEXPORT jobject JNICALL Java_com_pristineaudio_audio_NativeDeviceModule_nativeGetCurrentOutputDevice(JNIEnv*, jobject);

#ifdef __cplusplus
}
#endif
