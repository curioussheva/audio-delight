#include <jni.h>
#include <vector>
#include "EngineManager.h"

// ========================================
// OPTIONAL LEGACY BRIDGE (if needed)
// ========================================
extern "C"
AudioEngine* getAudioEngine() {
    return &EngineManager::get(); // redirect ke singleton baru
}

// ========================================
// JNI
// ========================================
extern "C" {

// ========================================
// Engine lifecycle
// ========================================
JNIEXPORT void JNICALL
Java_com_pristineaudio_NativeDSPModule_bootEngineNative(JNIEnv *, jobject) {
    EngineManager::get().start();
}

JNIEXPORT void JNICALL
Java_com_pristineaudio_NativeDSPModule_shutdownEngineNative(JNIEnv *, jobject) {
    // ❗ jangan delete engine
    EngineManager::get().stop();
}

// ========================================
// Audio input (REALTIME PATH)
// ========================================
JNIEXPORT void JNICALL
Java_com_pristineaudio_OboeAudioProcessor_feedNativeBuffer(
    JNIEnv* env,
    jobject,
    jobject byteBuffer,
    jint size,
    jint encoding
) {
    auto* data = static_cast<uint8_t*>(env->GetDirectBufferAddress(byteBuffer));
    if (!data) return;

    auto& engine = EngineManager::get();

    if (encoding == 2) { // PCM 16
        engine.pushPCM16(reinterpret_cast<int16_t*>(data), size / 2);
    } else {
        engine.pushFloat(reinterpret_cast<float*>(data), size / 4);
    }
}

// ========================================
// Visualizer
// ========================================
JNIEXPORT jfloatArray JNICALL
Java_com_pristineaudio_NativeVisualizerBridge_getVisualizerData(
    JNIEnv *env,
    jobject
) {
    auto& engine = EngineManager::get();
    auto fftData = engine.getVisualizerData();

    jfloatArray result = env->NewFloatArray(fftData.size());
    if (!result) return nullptr;

    env->SetFloatArrayRegion(result, 0, fftData.size(), fftData.data());
    return result;
}

}
