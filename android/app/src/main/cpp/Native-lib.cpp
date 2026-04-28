#include <jni.h>
#include <vector>
#include "AudioEngine.h"

// Global instance
static AudioEngine* gEngine = nullptr;

// ✅ C++ function → jangan masuk extern "C"
AudioEngine* getAudioEngine() {
    if (gEngine == nullptr) {
        gEngine = new AudioEngine();
    }
    return gEngine;
}

// ✅ JNI functions → wajib extern "C"
extern "C" {

JNIEXPORT void JNICALL
Java_com_pristineaudio_NativeDSPModule_bootEngineNative(JNIEnv *, jobject) {
    getAudioEngine()->start();
}

JNIEXPORT void JNICALL
Java_com_pristineaudio_NativeDSPModule_shutdownEngineNative(JNIEnv *, jobject) {
    if (gEngine != nullptr) {
        delete gEngine;
        gEngine = nullptr;
    }
}

JNIEXPORT void JNICALL
Java_com_pristineaudio_OboeAudioProcessor_feedNativeAudio(
    JNIEnv *env, jobject, jfloatArray data, jint num_samples) {

    if (num_samples <= 0) return;

    jfloat* samples = env->GetPrimitiveArrayCritical(data, nullptr);
    if (samples != nullptr) {
        getAudioEngine()->pushData(samples, num_samples);
        env->ReleasePrimitiveArrayCritical(data, samples, JNI_ABORT);
    }
}

JNIEXPORT jfloatArray JNICALL
Java_com_pristineaudio_NativeVisualizerBridge_getVisualizerData(JNIEnv *env, jobject) {

    auto& engine = *getAudioEngine();
    std::vector<float> fftData = engine.getVisualizerData();

    jfloatArray result = env->NewFloatArray(fftData.size());
    if (!result) return nullptr;

    env->SetFloatArrayRegion(result, 0, fftData.size(), fftData.data());
    return result;
}

} // extern "C" 