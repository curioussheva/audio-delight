#include <jni.h>
#include "AudioEngine.h"

// Menggunakan pointer statis agar engine tetap hidup selama aplikasi berjalan
static AudioEngine *engine = new AudioEngine();

extern "C" {

// 1. Sinkronisasi dengan NativeDSPModule.kt
// Path: Java_com_pristineaudio_app_NativeDSPModule_...
JNIEXPORT void JNICALL
Java_com_pristineaudio_NativeDSPModule_bootEngineNative(JNIEnv *env, jobject thiz) {
    if (engine) engine->start();
}

// 2. Sinkronisasi dengan OboeAudioProcessor.kt
// Asumsi OboeAudioProcessor berada di package com.pristineaudio.app
JNIEXPORT void JNICALL
Java_com_pristineaudio_OboeAudioProcessor_feedNativeAudio(
    JNIEnv *env, jobject thiz, jfloatArray data, jint num_samples) {
    
    if (engine) {
        jfloat *samples = env->GetFloatArrayElements(data, nullptr);
        if (samples != nullptr) {
            engine->pushData(samples, num_samples);
            // JNI_ABORT digunakan karena kita hanya membaca data (tidak mengubah array Java)
            env->ReleaseFloatArrayElements(data, samples, JNI_ABORT);
        }
    }
}

// 3. Tambahkan fungsi untuk mengakses pointer engine dari file .cpp lain
// Ini agar NativeDSPModule.cpp bisa memanggil engine yang sama
AudioEngine* getAudioEngine() {
    return engine;
}

} // extern "C"
