// =====================================================
// jni/NativeVisualizerModule.cpp
// =====================================================

#include <jni.h>

#include "../manager/EngineManager.h"

using namespace pristine;

extern "C" {

// =====================================================
// VISUALIZER DATA
// =====================================================

JNIEXPORT jfloatArray JNICALL
Java_com_pristineaudio_visualizer_NativeVisualizerBridge_getVisualizerData(
    JNIEnv* env,
    jobject
) {

    constexpr int kVisualizerSize = 256;

    jfloatArray array =
        env->NewFloatArray(
            kVisualizerSize
        );

    if (!array) {
        return nullptr;
    }

    float buffer[kVisualizerSize];

    EngineManager::get()
        .engine()
        .getVisualizerData(
            buffer,
            kVisualizerSize
        );

    env->SetFloatArrayRegion(
        array,
        0,
        kVisualizerSize,
        buffer
    );

    return array;
}

}