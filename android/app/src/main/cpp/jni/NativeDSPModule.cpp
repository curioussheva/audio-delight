// =====================================================
// jni/NativeDSPModule.cpp
// =====================================================

#include <jni.h>
#include "JniGuard.h"
#include <android/log.h>

#include <string>

#include "../manager/EngineManager.h"
#include "../core/AudioTypes.h"
#include "../core/DSPProcessingGate.h"

#define LOG_TAG "NativeDSP"

#define LOGD(...) \
__android_log_print( \
    ANDROID_LOG_DEBUG, \
    LOG_TAG, \
    __VA_ARGS__ \
)

using namespace pristine;

extern "C" {

// =====================================================
// EQUALIZER
// =====================================================

JNIEXPORT void JNICALL
Java_com_pristineaudio_dsp_NativeDSPModule_setNativeEqualizerBand(
    JNIEnv* env,
    jobject,
    jint band,
    jfloat gainDb
) {
    pristine::jni::guardedVoid(env, "setNativeEqualizerBand", [&] {

    if (band < 0 || band >= 10) {
        return;
    }

    EngineManager::get()
        .setEqBand(
            static_cast<int>(band),
            gainDb
        );
    });
}

// =====================================================
// EQUALIZER MASSAL (C-EQATOM, 2026-11-12)
// =====================================================
//
// Satu panggilan JNI untuk seluruh preset, bukan 10x loop per band.
// Nama fungsi HARUS cocok dengan `external fun` di Kotlin: JNI memakai
// mangling Java_com_<pkg>_<Class>_<namaFungsi> (lihat setNativeProcessingMode
// di bawah). Salah nama = UnsatisfiedLinkError saat runtime.
JNIEXPORT void JNICALL
Java_com_pristineaudio_dsp_NativeDSPModule_setNativeEqualizerBands(
    JNIEnv* env,
    jobject,
    jfloatArray gains
) {
    pristine::jni::guardedVoid(env, "setNativeEqualizerBands", [&] {

    if (gains == nullptr) {
        return;
    }

    const jsize length =
        env->GetArrayLength(gains);

    if (length <= 0) {
        return;
    }

    const jsize count =
        length > 10 ? 10 : length;

    jfloat buffer[10] = {};

    env->GetFloatArrayRegion(
        gains,
        0,
        count,
        buffer
    );

    EngineManager::get()
        .setEqBands(
            buffer,
            static_cast<int>(count)
        );
    });
}

// =====================================================
// BASS BOOST
// =====================================================

JNIEXPORT void JNICALL
Java_com_pristineaudio_dsp_NativeDSPModule_setNativeBassBoost(
    JNIEnv* env,
    jobject,
    jfloat gainDb
) {
    pristine::jni::guardedVoid(env, "setNativeBassBoost", [&] {

    EngineManager::get()
        .setBassBoost(gainDb);
    });
}

// =====================================================
// REVERB (2026-11-19)
// =====================================================
//
// Dulu tidak ada fungsi JNI ini — Kotlin setReverbPreset stub
// eksplisit (resolve false). Sekarang preset diteruskan ke engine
// (AudioState clamp 0..6 -> DSPChain -> ReverbNode Freeverb).
// Nama HARUS cocok dengan `external fun` di Kotlin (lihat
// setNativeEqualizerBands di atas): salah nama = UnsatisfiedLinkError.

JNIEXPORT void JNICALL
Java_com_pristineaudio_dsp_NativeDSPModule_setNativeReverbPreset(
    JNIEnv* env,
    jobject,
    jint preset
) {
    pristine::jni::guardedVoid(env, "setNativeReverbPreset", [&] {

    EngineManager::get()
        .setReverbPreset(static_cast<int>(preset));
    });
}

// =====================================================
// HRTF (2026-11-19)
// =====================================================
//
// Nama HARUS cocok dengan `external fun` di Kotlin: salah nama =
// UnsatisfiedLinkError.

JNIEXPORT void JNICALL
Java_com_pristineaudio_dsp_NativeDSPModule_setNativeHrtfEnabled(
    JNIEnv* env,
    jobject,
    jboolean enabled
) {
    pristine::jni::guardedVoid(env, "setNativeHrtfEnabled", [&] {

    EngineManager::get()
        .setHrtfEnabled(enabled == JNI_TRUE);
    });
}

// =====================================================
// MASTER EQ (P0-1, 2026-11-19)
// =====================================================
//
// Nama HARUS cocok dengan `external fun` di Kotlin: salah nama =
// UnsatisfiedLinkError.

JNIEXPORT void JNICALL
Java_com_pristineaudio_dsp_NativeDSPModule_setNativeEqEnabled(
    JNIEnv* env,
    jobject,
    jboolean enabled
) {
    pristine::jni::guardedVoid(env, "setNativeEqEnabled", [&] {

    EngineManager::get()
        .setEqEnabled(enabled == JNI_TRUE);
    });
}

// =====================================================
// MASTER GAIN
// =====================================================

JNIEXPORT void JNICALL
Java_com_pristineaudio_dsp_NativeDSPModule_setNativeMasterGain(
    JNIEnv* env,
    jobject,
    jfloat gain
) {
    pristine::jni::guardedVoid(env, "setNativeMasterGain", [&] {

    EngineManager::get()
        .setMasterGain(gain);
    });
}

// =====================================================
// STEREO WIDTH
// =====================================================

JNIEXPORT void JNICALL
Java_com_pristineaudio_dsp_NativeDSPModule_setNativeStereoWide(
    JNIEnv* env,
    jobject,
    jfloat width
) {
    pristine::jni::guardedVoid(env, "setNativeStereoWide", [&] {

    EngineManager::get()
        .setStereoWide(width);
    });
}

// =====================================================
// BALANCE
// =====================================================

JNIEXPORT void JNICALL
Java_com_pristineaudio_dsp_NativeDSPModule_setNativeBalance(
    JNIEnv* env,
    jobject,
    jfloat balance
) {
    pristine::jni::guardedVoid(env, "setNativeBalance", [&] {

    EngineManager::get()
        .setBalance(balance);
    });
}

// =====================================================
// LIMITER
// =====================================================

JNIEXPORT void JNICALL
Java_com_pristineaudio_dsp_NativeDSPModule_setNativeLimiterEnabled(
    JNIEnv* env,
    jobject,
    jboolean enabled
) {
    pristine::jni::guardedVoid(env, "setNativeLimiterEnabled", [&] {

    EngineManager::get()
        .setLimiterEnabled(enabled);
    });
}

// =====================================================
// PROCESSING MODE
// =====================================================
//
// Nama fungsi HARUS cocok dengan `external fun` di Kotlin: JNI memakai
// mangling Java_com_<pkg>_<Class>_<namaFungsi>, jadi `setNativeProcessingMode`
// di Kotlin mencari `..._setNativeProcessingMode` - bukan `..._setProcessingMode`.
// Salah nama = UnsatisfiedLinkError saat runtime (CI tetap lolos, karena ini
// bukan error kompilasi).
JNIEXPORT void JNICALL
Java_com_pristineaudio_dsp_NativeDSPModule_setNativeProcessingMode(
    JNIEnv* env,
    jobject,
    jint mode
) {
    pristine::jni::guardedVoid(env, "setNativeProcessingMode", [&] {

    // (C-CAST, 2026-11-12): jint dari JS TIDAK tervalidasi — dulu
    // static_cast<ProcessingMode>(mode) tanpa cek rentang, jadi nilai liar
    // (mis. 3, -1) lolos sebagai enum dan tidak diproses switch mana pun
    // di AudioPipeline (tanpa default) — audio jalan tanpa mode yang jelas.
    //
    // Penanganan nilai liar: DITOLAK, mode lama dipertahankan, error di-log.
    // BUKAN clamp ke DSP: clamp diam-diam menerapkan pemrosesan (EQ dkk.)
    // yang tidak pernah diminta — paling berbahaya kalau yang dimaksud
    // pemanggil adalah BitPerfect. BUKAN throw ke JS: tidak ada preseden
    // ThrowNew di cpp/ mana pun, dan exception yang melintasi @ReactMethod
    // Kotlin + bridge RN risikonya lebih besar daripada manfaatnya untuk
    // kasus yang tidak bisa terjadi lewat TS (engine.ts memetakan string
    // ke 0/1/2 saja, dengan try/catch di sekeliling panggilan). Yang
    // penting: state tidak berubah, audio terus jalan seperti sebelumnya,
    // dan nilai liarnya tercatat di logcat untuk diagnosis.
    const ProcessingMode requested =
        static_cast<ProcessingMode>(mode);

    if (!isValidProcessingMode(requested)) {

        __android_log_print(ANDROID_LOG_ERROR, "NativeDSPModule",
            "mode pemrosesan liar ditolak: %d (valid: 0=BitPerfect, "
            "1=DSP, 2=Immersive) - mode lama dipertahankan",
            (int)mode);
        return;
    }

    EngineManager::get()
        .setProcessingMode(
            requested
        );

    __android_log_print(ANDROID_LOG_INFO, "NativeDSPModule",
        "mode pemrosesan -> %d", (int)mode);
    });
}

// =====================================================
// DSP PROCESSING GATE
// =====================================================
//
// Sakelar pemrosesan AudioPipeline di jalur produksi. Sebelum 2026-10-07
// pipeline tidak pernah dipanggil saat memutar lagu, jadi mode DSP tidak
// berefek. Lihat core/DSPProcessingGate.h dan docs/adr/0001-*.
JNIEXPORT void JNICALL
Java_com_pristineaudio_dsp_NativeDSPModule_setNativeDSPProcessingEnabled(
    JNIEnv* env,
    jobject,
    jboolean enabled
) {
    pristine::jni::guardedVoid(env, "setNativeDSPProcessingEnabled", [&] {

    DSPProcessingGate::setEnabled(enabled == JNI_TRUE);

    // (B15-M1, 2026-11-15): metrik dspEnabled basi — gate tidak memegang
    // metrics, dan satu-satunya penulis metrik sebelumnya adalah start().
    // Tanpa ini, getStats() terus melaporkan nilai lama sesudah gate
    // dimatikan/dinyalakan dari Settings. Nilai yang ditulis = kondisi
    // gabungan (mode != BitPerfect && gate menyala), sama seperti start().
    EngineManager::get().engine().refreshDSPEnabledMetric();

    __android_log_print(ANDROID_LOG_INFO, "NativeDSPModule",
        "DSP processing in production: %s",
        DSPProcessingGate::enabled() ? "AKTIF" : "mati");
    });
}

JNIEXPORT jboolean JNICALL
Java_com_pristineaudio_dsp_NativeDSPModule_nativeIsDSPProcessingEnabled(
    JNIEnv* env,
    jobject
) {
    return pristine::jni::guarded<jboolean>(env, "nativeIsDSPProcessingEnabled", JNI_FALSE, [&]() -> jboolean {

    return DSPProcessingGate::enabled() ? JNI_TRUE : JNI_FALSE;
    });
}

// =====================================================
// EXCLUSIVE MODE
// =====================================================

JNIEXPORT void JNICALL
Java_com_pristineaudio_dsp_NativeDSPModule_toggleNativeExclusiveMode(
    JNIEnv* env,
    jobject,
    jboolean enabled
) {
    pristine::jni::guardedVoid(env, "toggleNativeExclusiveMode", [&] {

    EngineManager::get()
        .setExclusiveMode(enabled);
    });
}

JNIEXPORT void JNICALL
Java_com_pristineaudio_dsp_NativeDSPModule_setNativeSolfeggioFreq(
    JNIEnv* env, jobject, jfloat freq) {
    pristine::jni::guardedVoid(env, "setNativeSolfeggioFreq", [&] {
    EngineManager::get().setSolfeggioFreq(freq);
    });
}

JNIEXPORT void JNICALL
Java_com_pristineaudio_dsp_NativeDSPModule_setNativeBrainwaveFreq(
    JNIEnv* env, jobject, jfloat freq) {
    pristine::jni::guardedVoid(env, "setNativeBrainwaveFreq", [&] {
    EngineManager::get().setBrainwaveFreq(freq);
    });
}

JNIEXPORT void JNICALL
Java_com_pristineaudio_dsp_NativeDSPModule_setNativeResonanceIntensity(
    JNIEnv* env, jobject, jfloat intensity) {
    pristine::jni::guardedVoid(env, "setNativeResonanceIntensity", [&] {
    EngineManager::get().setResonanceIntensity(intensity);
    });
}

// =====================================================
// STATUS STREAM AKTUAL
// =====================================================
//
// Kedua query ini membaca keadaan Oboe stream yang BENAR-BENAR terbuka,
// bukan permintaan kita. Penting untuk kejujuran UI: kalau AAudio menolak
// exclusive, isExclusive() false meski mode bit-perfect dipilih — bit-perfect
// tidak tercapai dan user harus diberi tahu.

JNIEXPORT jboolean JNICALL
Java_com_pristineaudio_dsp_NativeDSPModule_nativeIsExclusiveModeActive(
    JNIEnv* env, jobject) {
    return pristine::jni::guarded<jboolean>(env, "nativeIsExclusiveModeActive", JNI_FALSE, [&]() -> jboolean {
    return static_cast<jboolean>(
        EngineManager::get().isExclusive()
    );
    });
}

JNIEXPORT jint JNICALL
Java_com_pristineaudio_dsp_NativeDSPModule_nativeGetActualSampleRate(
    JNIEnv* env, jobject) {
    return pristine::jni::guarded<jint>(env, "nativeGetActualSampleRate", 0, [&]() -> jint {
    return static_cast<jint>(
        EngineManager::get().actualSampleRate()
    );
    });
}

// F2 (2026-11-16): laju HARDWARE stream (bukan laju sisi app).
// Fallback 0 — "tidak diketahui"; UI menampilkan "—" dan tidak mengklaim.
JNIEXPORT jint JNICALL
Java_com_pristineaudio_dsp_NativeDSPModule_nativeGetHardwareSampleRate(
    JNIEnv* env, jobject) {
    return pristine::jni::guarded<jint>(env, "nativeGetHardwareSampleRate", 0, [&]() -> jint {
    return static_cast<jint>(
        EngineManager::get().hardwareSampleRate()
    );
    });
}

// C3.3 (Batch 18 susulan): laju stream AKTUAL == laju file?
// Fallback JNI_TRUE — jangan menuduh resampling bila bacaannya gagal;
// cabang unavailable di TS yang bicara saat engine belum siap.
JNIEXPORT jboolean JNICALL
Java_com_pristineaudio_dsp_NativeDSPModule_nativeIsRateHonored(
    JNIEnv* env, jobject) {
    return pristine::jni::guarded<jboolean>(env, "nativeIsRateHonored", JNI_TRUE, [&]() -> jboolean {
    return static_cast<jboolean>(
        EngineManager::get().isRateHonored()
    );
    });
}

// =====================================================
// KOREKSI HEADPHONE (Fase D)
// =====================================================
//
// Teks preset diterima sebagai jstring, di-parse DI SINI (thread pemanggil =
// UI thread), hasilnya dikonversi ke POD dan disimpan lewat seqlock di
// AudioState. Audio thread tidak pernah melihat teks maupun mengalokasi.

JNIEXPORT jboolean JNICALL
Java_com_pristineaudio_dsp_NativeDSPModule_nativeLoadHeadphonePreset(
    JNIEnv* env, jobject, jstring presetText) {
    return pristine::jni::guarded<jboolean>(env, "nativeLoadHeadphonePreset", JNI_FALSE, [&]() -> jboolean {

    if (presetText == nullptr) {
        return static_cast<jboolean>(false);
    }

    const char* chars =
        env->GetStringUTFChars(presetText, nullptr);

    if (chars == nullptr) {
        return static_cast<jboolean>(false);
    }

    const bool ok =
        EngineManager::get().loadHeadphonePreset(
            std::string(chars)
        );

    env->ReleaseStringUTFChars(presetText, chars);

    return static_cast<jboolean>(ok);
    });
}

JNIEXPORT jint JNICALL
Java_com_pristineaudio_dsp_NativeDSPModule_nativeValidateHeadphonePreset(
    JNIEnv* env, jobject, jstring presetText) {
    return pristine::jni::guarded<jint>(env, "nativeValidateHeadphonePreset", -1, [&]() -> jint {

    if (presetText == nullptr) {
        return -1;
    }

    const char* chars =
        env->GetStringUTFChars(presetText, nullptr);

    if (chars == nullptr) {
        return -1;
    }

    const int count =
        EngineManager::get().validateHeadphonePreset(
            std::string(chars)
        );

    env->ReleaseStringUTFChars(presetText, chars);

    return static_cast<jint>(count);
    });
}

JNIEXPORT void JNICALL
Java_com_pristineaudio_dsp_NativeDSPModule_nativeClearHeadphonePreset(
    JNIEnv* env, jobject) {
    pristine::jni::guardedVoid(env, "nativeClearHeadphonePreset", [&] {
    EngineManager::get().clearHeadphonePreset();
    });
}

JNIEXPORT void JNICALL
Java_com_pristineaudio_dsp_NativeDSPModule_setNativeHeadphoneCorrectionEnabled(
    JNIEnv* env, jobject, jboolean enabled) {
    pristine::jni::guardedVoid(env, "setNativeHeadphoneCorrectionEnabled", [&] {
    EngineManager::get().setHeadphoneCorrectionEnabled(enabled);
    });
}

JNIEXPORT jboolean JNICALL
Java_com_pristineaudio_dsp_NativeDSPModule_nativeIsHeadphoneCorrectionEnabled(
    JNIEnv* env, jobject) {
    return pristine::jni::guarded<jboolean>(env, "nativeIsHeadphoneCorrectionEnabled", JNI_FALSE, [&]() -> jboolean {
    return static_cast<jboolean>(
        EngineManager::get().isHeadphoneCorrectionEnabled()
    );
    });
}

}