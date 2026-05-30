#include "NativePlaybackModule.h"
#include "manager/EngineManager.h"
#include "playback/PlaybackController.h"
#include <android/log.h>

static pristine::PlaybackController* gPlaybackController = nullptr;

extern "C" {

JNIEXPORT void JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativePlay(JNIEnv*, jobject) {
    if (gPlaybackController) gPlaybackController->play();
}

JNIEXPORT void JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativePause(JNIEnv*, jobject) {
    if (gPlaybackController) gPlaybackController->pause();
}

JNIEXPORT void JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativeStop(JNIEnv*, jobject) {
    if (gPlaybackController) gPlaybackController->stop();
}

JNIEXPORT void JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativeSeek(JNIEnv*, jobject, jlong positionMs) {
    if (gPlaybackController) gPlaybackController->seekTo(static_cast<uint64_t>(positionMs));
}

JNIEXPORT jlong JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativeGetPosition(JNIEnv*, jobject) {
    return gPlaybackController ? gPlaybackController->getState().getPositionMs(48000) : 0;
}

JNIEXPORT jint JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativeGetStatus(JNIEnv*, jobject) {
    if (!gPlaybackController) return 0;
    return static_cast<jint>(gPlaybackController->getState().getStatus());
}

} // extern "C"

// Call this from NativePristineAudio to initialize
void initPlaybackModule(pristine::PlaybackController* controller) {
    gPlaybackController = controller;
}