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

    // FIX B2 (2026-11-10): 2048, bukan 256.
    //
    // Sebelumnya 256 — sementara FFT di Kotlin butuh FFT_SIZE = 2048 dan
    // menolak apa pun yang kurang (VISUALIZER_SHORT_BUFFER), jadi
    // getFFTData() selalu reject. Ukuran ini harus sama dengan FFT_SIZE
    // Kotlin DAN dengan VisualizerBuffer::kSize (2048): read() mengembalikan
    // `size` sample terakhir dari ring.
    constexpr int kVisualizerSize = 2048;

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