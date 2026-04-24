#include <jni.h>
#include <vector>
#include "AudioEngine.h"

// Instance global engine agar persisten selama aplikasi berjalan
static AudioEngine* gEngine = nullptr;

extern "C" {

// --- Helper Singleton untuk Module Lain ---
// Fungsi ini diekspos agar NativeDSPModule.cpp bisa memanggil engine yang sama
AudioEngine* getAudioEngine() {
    if (gEngine == nullptr) {
        gEngine = new AudioEngine();
    }
    return gEngine;
}

// --- Engine Lifecycle ---
JNIEXPORT void JNICALL
Java_com_pristineaudio_NativeDSPModule_bootEngineNative(JNIEnv *env, jobject thiz) {
    getAudioEngine()->start();
}

// --- Audio Data Bridge (Dipanggil oleh ExoPlayer/OboeAudioProcessor di Kotlin) ---
JNIEXPORT void JNICALL
Java_com_pristineaudio_OboeAudioProcessor_feedNativeAudio(
    JNIEnv *env, jobject thiz, jfloatArray data, jint num_samples) {
    
    if (num_samples > 0) {
        jfloat* samples = env->GetFloatArrayElements(data, nullptr);
        if (samples != nullptr) {
            getAudioEngine()->pushData(samples, num_samples);
            // JNI_ABORT: Membaca data tanpa perlu menyalinnya kembali ke memori Java (Optimasi Performa)
            env->ReleaseFloatArrayElements(data, samples, JNI_ABORT);
        }
    }
}

// --- Visualizer Data ---
JNIEXPORT jfloatArray JNICALL
Java_com_pristineaudio_NativeVisualizerBridge_getVisualizerData(JNIEnv *env, jobject thiz) {
    // Ambil data FFT/Waveform langsung dari Ring Buffer AudioEngine
    std::vector<float> fftData = getAudioEngine()->getVisualizerData();
    
    int binSize = fftData.size(); 
    jfloatArray result = env->NewFloatArray(binSize);
    
    if (binSize > 0) {
        env->SetFloatArrayRegion(result, 0, binSize, fftData.data());
    }
    return result;
}

} // extern "C"
