#include <jni.h>
#include <vector>
#include <cstdint>
#include "AudioEngine.h"

// ========================================
// Global Audio Engine (singleton simple)
// ========================================
static AudioEngine* gEngine = nullptr;

AudioEngine* getAudioEngine() {
    if (gEngine == nullptr) {
        gEngine = new AudioEngine();
    }
    return gEngine;
}

// ========================================
// JNI INTERFACE
// ========================================
extern "C" {

// ========================================
// Engine lifecycle
// ========================================
JNIEXPORT void JNICALL
Java_com_pristineaudio_NativeDSPModule_bootEngineNative(JNIEnv *, jobject) {
    getAudioEngine()->start();
}

JNIEXPORT void JNICALL
Java_com_pristineaudio_NativeDSPModule_shutdownEngineNative(JNIEnv *, jobject) {
    if (gEngine != nullptr) {
        gEngine->stop(); // optional tapi recommended
        delete gEngine;
        gEngine = nullptr;
    }
}

// ========================================
// Audio input (Java → Native)
// ========================================
JNIEXPORT void JNICALL
Java_com_pristineaudio_OboeAudioProcessor_feedNativeAudio(
    JNIEnv *env,
    jobject /* this */,
    jfloatArray data,
    jint num_samples
) {
    if (data == nullptr || num_samples <= 0) return;

    // Ambil pointer langsung (fast path)
    jfloat* samples = (jfloat*) env->GetPrimitiveArrayCritical(data, nullptr);

    if (samples != nullptr) {
        // Copy ke buffer aman (hindari blocking GC terlalu lama)
        std::vector<float> buffer(samples, samples + num_samples);

        // WAJIB release secepat mungkin
        env->ReleasePrimitiveArrayCritical(data, samples, JNI_ABORT);

        // Kirim ke audio engine
        getAudioEngine()->pushData(buffer.data(), num_samples);
    }
}

// ========================================
// Visualizer output (Native → Java)
// ========================================
JNIEXPORT jfloatArray JNICALL
Java_com_pristineaudio_NativeVisualizerBridge_getVisualizerData(
    JNIEnv *env,
    jobject /* this */
) {
    auto& engine = *getAudioEngine();

    std::vector<float> fftData = engine.getVisualizerData();

    jsize size = static_cast<jsize>(fftData.size());
    jfloatArray result = env->NewFloatArray(size);

    if (result == nullptr) {
        return nullptr; // Out of memory
    }

    env->SetFloatArrayRegion(result, 0, size, fftData.data());
    return result;
}

} // extern "C" 