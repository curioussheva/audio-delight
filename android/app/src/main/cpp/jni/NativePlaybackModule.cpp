#include "NativePlaybackModule.h"
#include "manager/EngineManager.h"
#include "playback/PlaybackController.h"
#include "playback/TrackQueue.h"
#include <android/log.h>
#include <vector>
#include <string>

static pristine::playback::PlaybackController* gPlaybackController = nullptr;

// Lazy getter + auto-init engine & controller
static pristine::playback::PlaybackController* getController() {
    if (!gPlaybackController) {
        gPlaybackController = &pristine::EngineManager::get().playback();
    }
    __android_log_print(ANDROID_LOG_DEBUG, "NativePlaybackModule", "getController: controller=%p", (void*)gPlaybackController);

    if (!gPlaybackController->isInitialized()) {
        gPlaybackController->initialize();
        __android_log_print(ANDROID_LOG_DEBUG, "NativePlaybackModule", "controller initialized");
    }

    if (!pristine::EngineManager::get().engine().isRunning()) {
        pristine::EngineManager::get().start();
        __android_log_print(ANDROID_LOG_DEBUG, "NativePlaybackModule", "engine started");
    }

    return gPlaybackController;
}

extern "C" {

JNIEXPORT void JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativePlay(JNIEnv*, jobject) {
    __android_log_print(ANDROID_LOG_DEBUG, "NativePlaybackModule", "nativePlay called");
    auto* controller = getController();
    if (controller) controller->play();
}

JNIEXPORT void JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativePause(JNIEnv*, jobject) {
    auto* controller = getController();
    if (controller) controller->pause();
}

JNIEXPORT void JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativeStop(JNIEnv*, jobject) {
    auto* controller = getController();
    if (controller) controller->stop();
}

JNIEXPORT void JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativeSeek(JNIEnv*, jobject, jlong positionMs) {
    auto* controller = getController();
    if (controller) controller->seek(static_cast<double>(positionMs) / 1000.0);
}

JNIEXPORT jlong JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativeGetPosition(JNIEnv*, jobject) {
    auto* controller = getController();
    if (!controller) return 0;
    return static_cast<jlong>(controller->state()->getPosition().positionMs);
}

JNIEXPORT jint JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativeGetStatus(JNIEnv*, jobject) {
    auto* controller = getController();
    if (!controller) return 0;
    return static_cast<jint>(controller->state()->getStatus());
}

JNIEXPORT void JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativeNext(JNIEnv*, jobject) {
    auto* controller = getController();
    if (controller) controller->next();
}

JNIEXPORT void JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativePrevious(JNIEnv*, jobject) {
    auto* controller = getController();
    if (controller) controller->previous();
}

JNIEXPORT void JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativeSetShuffle(JNIEnv*, jobject, jboolean enabled) {
    auto* controller = getController();
    if (controller) controller->setShuffle(enabled);
}

JNIEXPORT void JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativeSetRepeatMode(JNIEnv*, jobject, jint mode) {
    auto* controller = getController();
    if (controller) controller->setRepeatMode(static_cast<pristine::playback::RepeatMode>(mode));
}

JNIEXPORT jobjectArray JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativeGetQueue(JNIEnv* env, jobject) {
    auto* controller = getController();
    if (!controller) return env->NewObjectArray(0, env->FindClass("java/lang/String"), nullptr);

    auto queue = controller->queue()->tracks();
    jobjectArray result = env->NewObjectArray(queue.size(), env->FindClass("java/lang/String"), nullptr);
    for (size_t i = 0; i < queue.size(); ++i) {
        jstring str = env->NewStringUTF(queue[i].uri.c_str());
        env->SetObjectArrayElement(result, i, str);
        env->DeleteLocalRef(str);
    }
    return result;
}

JNIEXPORT void JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativeSetQueue(JNIEnv* env, jobject, jobjectArray uris) {
    auto* controller = getController();
    if (!controller) return;

    jsize length = env->GetArrayLength(uris);
    __android_log_print(ANDROID_LOG_DEBUG, "NativePlaybackModule", "nativeSetQueue, length=%d", (int)length);

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
    controller->queue()->setTracks(tracks);
}

JNIEXPORT jstring JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativeGetCurrentTrack(JNIEnv* env, jobject) {
    auto* controller = getController();
    if (!controller) return env->NewStringUTF("");
    auto track = controller->queue()->current();
    if (track) {
        return env->NewStringUTF(track->uri.c_str());
    }
    return env->NewStringUTF("");
}

} // extern "C"

void initPlaybackModule(pristine::playback::PlaybackController* controller) {
    gPlaybackController = controller;
}