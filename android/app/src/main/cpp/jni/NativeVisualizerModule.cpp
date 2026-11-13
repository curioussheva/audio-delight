// =====================================================
// jni/NativeVisualizerModule.cpp
// =====================================================

#include <jni.h>
#include "JniGuard.h"

#include "../manager/EngineManager.h"
#include "../visualizer/VisualizerBuffer.h"

using namespace pristine;

extern "C" {

// =====================================================
// VISUALIZER DATA
// =====================================================

JNIEXPORT void JNICALL
Java_com_pristineaudio_visualizer_NativeVisualizerBridge_getVisualizerData(
    JNIEnv* env,
    jobject,
    jfloatArray out
) {
    pristine::jni::guardedVoid(env, "getVisualizerData", [&]() {

    // FIX B2 (2026-11-10): 2048, bukan 256.
    //
    // Sebelumnya 256 — sementara FFT di Kotlin butuh FFT_SIZE = 2048 dan
    // menolak apa pun yang kurang (VISUALIZER_SHORT_BUFFER), jadi
    // getFFTData() selalu reject. Ukuran ini harus sama dengan FFT_SIZE
    // Kotlin DAN dengan VisualizerBuffer::kSize (2048): read() mengembalikan
    // `size` sample terakhir dari ring.
    constexpr int kVisualizerSize = 2048;

    // 🔥 FIX (2026-11-11, V-m3): ikat compile-time ke
    // VisualizerBuffer::kSize. Drift seperti ini sudah pernah terjadi
    // (B2: JNI 256 vs buffer 2048, diperbaiki 2026-11-10).
    static_assert(kVisualizerSize == static_cast<int>(VisualizerBuffer::kSize),
                  "kVisualizerSize harus sama dengan VisualizerBuffer::kSize");

    // B12-W9: tidak ada lagi NewFloatArray di sini. Kotlin mengirim satu
    // FloatArray yang dipakai ulang tiap panggilan (~20x/detik) dan fungsi
    // ini hanya mengisinya via SetFloatArrayRegion. Array null / lebih
    // pendek dari kVisualizerSize ditolak keras supaya tidak diam-diam
    // menghitung spektrum dari data basi.
    if (out == nullptr || env->GetArrayLength(out) < kVisualizerSize) {
        jclass exClass = env->FindClass("java/lang/IllegalArgumentException");
        if (exClass != nullptr) {
            env->ThrowNew(exClass, "getVisualizerData: out null atau < 2048");
            env->DeleteLocalRef(exClass);
        }
        return;
    }

    // Stack array, bukan heap: biaya nyata yang dihapus B12-W9 adalah
    // NewFloatArray(2048) per panggilan, bukan buffer ini.
    float buffer[kVisualizerSize];

    EngineManager::get()
        .engine()
        .getVisualizerData(
            buffer,
            kVisualizerSize
        );

    env->SetFloatArrayRegion(
        out,
        0,
        kVisualizerSize,
        buffer
    );
    });
}

}