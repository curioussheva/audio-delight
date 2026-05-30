#pragma once
#include <jni.h>

#ifdef __cplusplus
extern "C" {
#endif

JNIEXPORT void JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativePlay(JNIEnv*, jobject);
JNIEXPORT void JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativePause(JNIEnv*, jobject);
JNIEXPORT void JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativeStop(JNIEnv*, jobject);
JNIEXPORT void JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativeSeek(JNIEnv*, jobject, jlong positionMs);
JNIEXPORT jlong JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativeGetPosition(JNIEnv*, jobject);
JNIEXPORT jint JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativeGetStatus(JNIEnv*, jobject);

#ifdef __cplusplus
}
#endif