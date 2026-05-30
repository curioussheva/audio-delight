// =====================================================
// jni/NativeAudioFeed.cpp
// =====================================================

#include <jni.h>

#include "../manager/EngineManager.h"

using namespace pristine;

extern "C" {

// =====================================================
// FLOAT PCM
// =====================================================

JNIEXPORT void JNICALL
Java_com_pristineaudio_audio_OboeAudioProcessor_feedFloatBuffer(
    JNIEnv* env,
    jobject,
    jobject buffer,
    jint size
) {

    auto* data =
        static_cast<float*>(
            env->GetDirectBufferAddress(buffer)
        );

    if (!data) {
        return;
    }

    EngineManager::get()
        .engine()
        .pushData(
            data,
            size / sizeof(float)
        );
}

// =====================================================
// PCM16
// =====================================================

JNIEXPORT void JNICALL
Java_com_pristineaudio_audio_OboeAudioProcessor_feedPCM16Buffer(
    JNIEnv* env,
    jobject,
    jobject buffer,
    jint size
) {

    auto* src =
        static_cast<int16_t*>(
            env->GetDirectBufferAddress(buffer)
        );

    if (!src) {
        return;
    }

    static float temp[8192];

    const int samples =
        size / sizeof(int16_t);

    for (int i = 0; i < samples; ++i) {

        temp[i] =
            static_cast<float>(src[i])
            / 32768.0f;
    }

    EngineManager::get()
        .engine()
        .pushData(
            temp,
            samples
        );
}

}