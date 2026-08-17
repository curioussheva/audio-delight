// =====================================================
// jni/NativeDSPModule.cpp
// =====================================================

#include <jni.h>
#include <android/log.h>

#include "../manager/EngineManager.h"
#include "../core/AudioTypes.h"

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
    JNIEnv*,
    jobject,
    jint band,
    jfloat gainDb
) {

    if (band < 0 || band >= 10) {
        return;
    }

    EngineManager::get()
        .setEqBand(
            static_cast<int>(band),
            gainDb
        );
}

// =====================================================
// BASS BOOST
// =====================================================

JNIEXPORT void JNICALL
Java_com_pristineaudio_dsp_NativeDSPModule_setNativeBassBoost(
    JNIEnv*,
    jobject,
    jfloat gainDb
) {

    EngineManager::get()
        .setBassBoost(gainDb);
}

// =====================================================
// MASTER GAIN
// =====================================================

JNIEXPORT void JNICALL
Java_com_pristineaudio_dsp_NativeDSPModule_setNativeMasterGain(
    JNIEnv*,
    jobject,
    jfloat gain
) {

    EngineManager::get()
        .setMasterGain(gain);
}

// =====================================================
// STEREO WIDTH
// =====================================================

JNIEXPORT void JNICALL
Java_com_pristineaudio_dsp_NativeDSPModule_setNativeStereoWide(
    JNIEnv*,
    jobject,
    jfloat width
) {

    EngineManager::get()
        .setStereoWide(width);
}

// =====================================================
// BALANCE
// =====================================================

JNIEXPORT void JNICALL
Java_com_pristineaudio_dsp_NativeDSPModule_setNativeBalance(
    JNIEnv*,
    jobject,
    jfloat balance
) {

    EngineManager::get()
        .setBalance(balance);
}

// =====================================================
// DSP ENABLE
// =====================================================

JNIEXPORT void JNICALL
Java_com_pristineaudio_dsp_NativeDSPModule_setNativeDSPEnabled(
    JNIEnv*,
    jobject,
    jboolean enabled
) {

    EngineManager::get()
        .setDSPEnabled(enabled);
}

// =====================================================
// LIMITER
// =====================================================

JNIEXPORT void JNICALL
Java_com_pristineaudio_dsp_NativeDSPModule_setNativeLimiterEnabled(
    JNIEnv*,
    jobject,
    jboolean enabled
) {

    EngineManager::get()
        .setLimiterEnabled(enabled);
}

// =====================================================
// PROCESSING MODE
// =====================================================

JNIEXPORT void JNICALL
Java_com_pristineaudio_dsp_NativeDSPModule_setProcessingMode(
    JNIEnv*,
    jobject,
    jint mode
) {

    EngineManager::get()
        .setProcessingMode(
            static_cast<ProcessingMode>(mode)
        );
}

// =====================================================
// EXCLUSIVE MODE
// =====================================================

JNIEXPORT void JNICALL
Java_com_pristineaudio_dsp_NativeDSPModule_toggleNativeExclusiveMode(
    JNIEnv*,
    jobject,
    jboolean enabled
) {

    EngineManager::get()
        .setExclusiveMode(enabled);
}

JNIEXPORT void JNICALL
Java_com_pristineaudio_dsp_NativeDSPModule_setNativeSolfeggioFreq(
    JNIEnv*, jobject, jfloat freq) {
    EngineManager::get().setSolfeggioFreq(freq);
}

JNIEXPORT void JNICALL
Java_com_pristineaudio_dsp_NativeDSPModule_setNativeBrainwaveFreq(
    JNIEnv*, jobject, jfloat freq) {
    EngineManager::get().setBrainwaveFreq(freq);
}

JNIEXPORT void JNICALL
Java_com_pristineaudio_dsp_NativeDSPModule_setNativeResonanceIntensity(
    JNIEnv*, jobject, jfloat intensity) {
    EngineManager::get().setResonanceIntensity(intensity);
}

JNIEXPORT void JNICALL
Java_com_pristineaudio_dsp_NativeDSPModule_setNativeImmersiveEnabled(
    JNIEnv*, jobject, jboolean enabled) {
    EngineManager::get().setImmersiveEnabled(enabled);
}

}