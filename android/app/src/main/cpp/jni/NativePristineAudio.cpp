// =====================================================
// jni/NativePristineAudio.cpp
// =====================================================

#include <jni.h>

#include "../manager/EngineManager.h"

using namespace pristine;

extern "C" {

// =====================================================
// ENGINE LIFECYCLE
// =====================================================

JNIEXPORT void JNICALL
Java_com_pristineaudio_audio_NativePristineAudio_nativeStart(
    JNIEnv*,
    jobject
) {
    EngineManager::get()
        .engine()
        .start();
}

JNIEXPORT void JNICALL
Java_com_pristineaudio_audio_NativePristineAudio_nativeStop(
    JNIEnv*,
    jobject
) {
    EngineManager::get()
        .engine()
        .stop();
}

// =====================================================
// AUDIO STREAM DATA
// float[] PCM interleaved stereo
// =====================================================

JNIEXPORT void JNICALL
Java_com_pristineaudio_audio_NativePristineAudio_nativePushAudio(
    JNIEnv* env,
    jobject,
    jfloatArray data,
    jint size
) {

    if (!data || size <= 0) {
        return;
    }

    jfloat* ptr =
        env->GetFloatArrayElements(
            data,
            nullptr
        );

    if (!ptr) {
        return;
    }

    EngineManager::get()
        .engine()
        .pushData(
            ptr,
            size
        );

    env->ReleaseFloatArrayElements(
        data,
        ptr,
        JNI_ABORT
    );
}

// =====================================================
// ENGINE STATUS
// =====================================================

JNIEXPORT jboolean JNICALL
Java_com_pristineaudio_audio_NativePristineAudio_nativeIsRunning(
    JNIEnv*,
    jobject
) {

    return static_cast<jboolean>(
        EngineManager::get()
            .engine()
            .isRunning()
    );
}

// =====================================================
// STATS
// =====================================================

JNIEXPORT jfloat JNICALL
Java_com_pristineaudio_audio_NativePristineAudio_nativeGetLatency(
    JNIEnv*,
    jobject
) {

    return EngineManager::get()
        .engine()
        .getStats()
        .latencyMs;
}

JNIEXPORT jlong JNICALL
Java_com_pristineaudio_audio_NativePristineAudio_nativeGetUnderruns(
    JNIEnv*,
    jobject
) {

    return static_cast<jlong>(
        EngineManager::get()
            .engine()
            .getStats()
            .underruns
    );
}

JNIEXPORT jlong JNICALL
Java_com_pristineaudio_audio_NativePristineAudio_nativeGetOverruns(
    JNIEnv*,
    jobject
) {

    return static_cast<jlong>(
        EngineManager::get()
            .engine()
            .getStats()
            .overruns
    );
}

}