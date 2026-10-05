#include "NativePlaybackModule.h"
#include "manager/EngineManager.h"
#include "playback/PlaybackController.h"
#include "playback/TrackQueue.h"
#include "playback/NativeEventEmitter.h"
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

// 🔥 Simpan reference ke Java module untuk callback native→JS.
// Dipanggil dari NativePlaybackModule.kt init {} — thread yang punya JNIEnv.
JNIEXPORT void JNICALL
Java_com_pristineaudio_audio_NativePlaybackModule_nativeInitEventEmitter(
    JNIEnv* env, jobject instance
) {
    pristine::playback::initModuleRef(env, instance);
}

// Mengembalikan jboolean supaya lapisan atas bisa tahu play() GAGAL.
// Sebelumnya void: kegagalan dekoder (mis. avformat_open_input failed untuk
// URI yang belum di-resolve) hilang begitu saja dan UI tetap menampilkan
// "sedang diputar" walau tidak ada suara. Terbukti pada logcat 2026-10-04
// 12:22 - play(): FAILED tiga kali, tapi updateMetadata tetap jalan.
JNIEXPORT jboolean JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativePlay(JNIEnv*, jobject) {
    __android_log_print(ANDROID_LOG_INFO, "NativePlaybackModule",
                        "nativePlay() called from JS");
    auto* controller = getController();
    if (!controller) {
        __android_log_print(ANDROID_LOG_ERROR, "NativePlaybackModule",
                            "nativePlay: controller null!");
        return JNI_FALSE;
    }
    const bool ok = controller->play();
    __android_log_print(ANDROID_LOG_INFO, "NativePlaybackModule",
                        "nativePlay() returned ok=%d", ok ? 1 : 0);
    return ok ? JNI_TRUE : JNI_FALSE;
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

// Indeks trek aktif di queue native. Native yang memegang queue dan indeks,
// jadi JS harus menanyakan ini alih-alih menghitung sendiri - kalau JS
// menghitung sendiri, shuffle dan repeat di sisi native tidak terhitung dan
// lagu yang dimuat bisa berbeda dari yang ditampilkan UI.
JNIEXPORT jint JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativeGetCurrentIndex(JNIEnv*, jobject) {
    auto* controller = getController();
    if (!controller || !controller->queue()) return -1;
    const auto& tracks = controller->queue()->tracks();
    if (tracks.empty()) return -1;
    return static_cast<jint>(controller->queue()->currentIndex());
}

// Jumlah trek di queue native. Dipakai JS untuk memvalidasi indeks dan
// mendeteksi queue yang berubah di luar kendalinya.
JNIEXPORT jint JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativeGetQueueSize(JNIEnv*, jobject) {
    auto* controller = getController();
    if (!controller || !controller->queue()) return 0;
    return static_cast<jint>(controller->queue()->tracks().size());
}

// Lompat ke indeks tertentu di queue native lalu muat treknya.
// next()/previous() di C++ sudah memuat track sendiri, jadi jalur ini dibuat
// sama: jumpTo di queue, lalu loadTrack. Tanpa memuat di sini, JS harus
// memanggil setQueue ulang hanya untuk berpindah trek - itu menimpa queue
// native dan membuang indeks yang sudah dihitung native (termasuk urutan
// shuffle yang hanya diketahui native).
JNIEXPORT jboolean JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativeJumpTo(JNIEnv*, jobject, jint index) {
    auto* controller = getController();
    if (!controller || !controller->queue() || index < 0) return JNI_FALSE;

    auto q = controller->queue();
    if (static_cast<size_t>(index) >= q->tracks().size()) return JNI_FALSE;
    if (!q->jumpTo(static_cast<size_t>(index))) return JNI_FALSE;

    auto track = q->current();
    if (!track) return JNI_FALSE;
    return controller->loadTrack(*track) ? JNI_TRUE : JNI_FALSE;
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

JNIEXPORT void JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativeSetQueue(
    JNIEnv* env, jobject, jobjectArray uris) {

    __android_log_print(ANDROID_LOG_INFO, "NativePlaybackModule",
                        "nativeSetQueue() called");

    auto* controller = getController();
    if (!controller) {
        __android_log_print(ANDROID_LOG_ERROR, "NativePlaybackModule",
                            "nativeSetQueue: controller null!");
        return;
    }

    jsize length = env->GetArrayLength(uris);
    __android_log_print(ANDROID_LOG_INFO, "NativePlaybackModule",
                        "nativeSetQueue: length=%d", (int)length);

    std::vector<pristine::playback::TrackInfo> tracks;
    for (jsize i = 0; i < length; ++i) {
        jstring js = (jstring) env->GetObjectArrayElement(uris, i);
        if (!js) continue;

        const char* cstr = env->GetStringUTFChars(js, nullptr);
        if (!cstr) { env->DeleteLocalRef(js); continue; }

        __android_log_print(ANDROID_LOG_INFO, "NativePlaybackModule",
                            "nativeSetQueue: URI[%d] = %s", (int)i, cstr);

        pristine::playback::TrackInfo info;
        info.uri = cstr;
        tracks.push_back(info);

        env->ReleaseStringUTFChars(js, cstr);
        env->DeleteLocalRef(js);
    }

    controller->queue()->setTracks(tracks);
    __android_log_print(ANDROID_LOG_INFO, "NativePlaybackModule",
                        "nativeSetQueue: setTracks called with %zu tracks",
                        tracks.size());
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