#include <jni.h>
#include "AudioEngine.h"

// Global static engine (singleton sederhana)
static AudioEngine* engine = nullptr;

extern "C" {

// ==================== BOOT ENGINE ====================
// Dipanggil dari NativeDSPModule.kt
JNIEXPORT void JNICALL
Java_com_pristineaudio_NativeDSPModule_bootEngineNative(JNIEnv *env, jobject thiz) {
    if (engine == nullptr) {
        engine = new AudioEngine();
    }
    if (engine) {
        engine->start();
    }
}

// ==================== FEED AUDIO DATA ====================
// Dipanggil dari OboeAudioProcessor.kt
JNIEXPORT void JNICALL
Java_com_pristineaudio_OboeAudioProcessor_feedNativeAudio(
    JNIEnv *env, jobject thiz, jfloatArray data, jint num_samples) {
    
    if (engine == nullptr || num_samples <= 0) {
        return;
    }

    jfloat* samples = env->GetFloatArrayElements(data, nullptr);
    if (samples != nullptr) {
        engine->pushData(samples, num_samples);
        env->ReleaseFloatArrayElements(data, samples, JNI_ABORT);  // Hanya baca
    }
}

// ==================== HELPER UNTUK NATIVE DSP MODULE ====================
// Agar NativeDSPModule.cpp bisa mengakses engine yang sama
AudioEngine* getAudioEngine() {
    return engine;
}

} // extern "C" 