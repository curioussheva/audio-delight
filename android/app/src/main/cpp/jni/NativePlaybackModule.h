#pragma once
#include <jni.h>

namespace pristine::playback {
class PlaybackController;
}

#ifdef __cplusplus
extern "C" {
#endif

JNIEXPORT jboolean JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativePlay(JNIEnv*, jobject);
JNIEXPORT void JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativePause(JNIEnv*, jobject);
JNIEXPORT void JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativeStop(JNIEnv*, jobject);
JNIEXPORT void JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativeSeek(JNIEnv*, jobject, jlong positionMs);
JNIEXPORT jlong JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativeGetPosition(JNIEnv*, jobject);
JNIEXPORT jint JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativeGetStatus(JNIEnv*, jobject);

// Queue & navigasi. Native yang memegang queue dan indeks, jadi JS menanyakan
// ini alih-alih menghitung sendiri - kalau JS menghitung sendiri, urutan
// shuffle di sisi native tidak terhitung.
JNIEXPORT jint JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativeGetCurrentIndex(JNIEnv*, jobject);
JNIEXPORT jint JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativeGetQueueSize(JNIEnv*, jobject);
JNIEXPORT jboolean JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativeJumpTo(JNIEnv*, jobject, jint index);

#ifdef __cplusplus
}
#endif

// Call this from JNI_OnLoad to initialize playback controller
void initPlaybackModule(pristine::playback::PlaybackController* controller);