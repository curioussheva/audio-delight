#include "NativePlaybackModule.h"
#include "manager/EngineManager.h"
#include "playback/PlaybackController.h"
#include "playback/TrackQueue.h"
#include <android/log.h>
#include <vector>
#include <string>

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

JNIEXPORT void JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativeNext(JNIEnv*, jobject) {
    if (gPlaybackController) gPlaybackController->next();
}

JNIEXPORT void JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativePrevious(JNIEnv*, jobject) {
    if (gPlaybackController) gPlaybackController->previous();
}

JNIEXPORT void JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativeSetShuffle(JNIEnv*, jobject, jboolean enabled) {
    if (gPlaybackController) gPlaybackController->setShuffle(enabled);
}

JNIEXPORT void JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativeSetRepeatMode(JNIEnv*, jobject, jint mode) {
    if (gPlaybackController) gPlaybackController->setRepeatMode(static_cast<pristine::playback::RepeatMode>(mode));
}

JNIEXPORT jobjectArray JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativeGetQueue(JNIEnv* env, jobject) {
    if (!gPlaybackController) return env->NewObjectArray(0, env->FindClass("java/lang/String"), nullptr);

    auto queue = gPlaybackController->queue()->tracks();
    jobjectArray result = env->NewObjectArray(queue.size(), env->FindClass("java/lang/String"), nullptr);
    for (size_t i = 0; i < queue.size(); ++i) {
        jstring str = env->NewStringUTF(queue[i].uri.c_str());
        env->SetObjectArrayElement(result, i, str);
        env->DeleteLocalRef(str);
    }
    return result;
}

JNIEXPORT void JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativeSetQueue(JNIEnv* env, jobject, jobjectArray uris) {
    if (!gPlaybackController) return;

    jsize length = env->GetArrayLength(uris);
    std::vector<pristine::playback::TrackInfo> tracks;
    for (jsize i = 0; i < length; ++i) {
        jstring js = (jstring) env->GetObjectArrayElement(uris, i);
        const char* cstr = env->GetStringUTFChars(js, nullptr);
        pristine::playback::TrackInfo info;
        info.uri = cstr;
        tracks.push_back(info);
        env->ReleaseStringUTFChars(js, cstr);
        env->DeleteLocalRef(js);
    }
    gPlaybackController->queue()->setTracks(tracks);
}

JNIEXPORT jstring JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativeGetCurrentTrack(JNIEnv* env, jobject) {
    if (!gPlaybackController) return env->NewStringUTF("");
    auto track = gPlaybackController->queue()->current();
    if (track) {
        return env->NewStringUTF(track->uri.c_str());
    }
    return env->NewStringUTF("");
}

} // extern "C"

void initPlaybackModule(pristine::playback::PlaybackController* controller) {
    gPlaybackController = controller;
}