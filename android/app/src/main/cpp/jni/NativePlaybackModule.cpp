#include "NativePlaybackModule.h"
#include "manager/EngineManager.h"
#include "playback/PlaybackController.h"
#include <android/log.h>

static pristine::playback::PlaybackController* gPlaybackController = nullptr;

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
    if (gPlaybackController) gPlaybackController->seek(static_cast<double>(positionMs) / 1000.0);
}

JNIEXPORT jlong JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativeGetPosition(JNIEnv*, jobject) {
    if (!gPlaybackController) return 0;
    return static_cast<jlong>(gPlaybackController->state()->getPosition().positionMs);
}

JNIEXPORT jint JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativeGetStatus(JNIEnv*, jobject) {
    if (!gPlaybackController) return 0;
    return static_cast<jint>(gPlaybackController->state()->getStatus());
}

} // extern "C"

// Call this from NativePristineAudio to initialize
void initPlaybackModule(pristine::playback::PlaybackController* controller) {
    gPlaybackController = controller;
}