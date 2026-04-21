#include <jni.h>
#include <vector>
#include "AudioEngine.h"

// Singleton engine
static AudioEngine* engine = nullptr;

extern "C" {

// --- Engine Lifecycle ---
JNIEXPORT void JNICALL
Java_com_pristineaudio_NativeDSPModule_bootEngineNative(JNIEnv *env, jobject thiz) {
    if (engine == nullptr) {
        engine = new AudioEngine();
    }
    if (engine) engine->start();
}

// --- Audio Data Bridge ---
JNIEXPORT void JNICALL
Java_com_pristineaudio_OboeAudioProcessor_feedNativeAudio(
    JNIEnv *env, jobject thiz, jfloatArray data, jint num_samples) {
    
    if (engine != nullptr && num_samples > 0) {
        jfloat* samples = env->GetFloatArrayElements(data, nullptr);
        if (samples != nullptr) {
            engine->pushData(samples, num_samples);
            env->ReleaseFloatArrayElements(data, samples, JNI_ABORT);
        }
    }
}

// --- Visualizer Data (Baru) ---
JNIEXPORT jfloatArray JNICALL
Java_com_pristineaudio_NativeVisualizerBridge_getVisualizerData(JNIEnv *env, jobject thiz) {
    // Ukuran FFT standar untuk mobile (128 bin cukup untuk bar visualizer)
    int binSize = 128;
    std::vector<float> fftData(binSize, 0.0f); 

    if (engine != nullptr) {
        // Nanti di AudioEngine.cpp kita buat fungsi getFFT()
        // fftData = engine->getFFT(); 
    }
    
    jfloatArray result = env->NewFloatArray(binSize);
    env->SetFloatArrayRegion(result, 0, binSize, fftData.data());
    return result;
}

// --- Helper untuk Module Lain ---
AudioEngine* getAudioEngine() {
    return engine;
}

} // extern "C"
 