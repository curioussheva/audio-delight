#include <jni.h>
#include <android/log.h>
#include "EngineManager.h"

#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, "NativeDSP", __VA_ARGS__)

extern "C" {

// ==========================================
// DSP CONTROL
// ==========================================

JNIEXPORT void JNICALL
Java_com_pristineaudio_NativeDSPModule_setNativeEqualizerBand(
    JNIEnv *, jobject, jint band, jfloat gainDb) {

    EngineManager::get().setEqBand(band, gainDb);
}

JNIEXPORT void JNICALL
Java_com_pristineaudio_NativeDSPModule_setNativeBassBoost(
    JNIEnv *, jobject, jfloat gainDb) {

    EngineManager::get().setBassBoost(gainDb);
}

JNIEXPORT void JNICALL
Java_com_pristineaudio_NativeDSPModule_setNativeMasterGain(
    JNIEnv *, jobject, jfloat gain) {

    EngineManager::get().setMasterGain(gain);
}

JNIEXPORT void JNICALL
Java_com_pristineaudio_NativeDSPModule_setNativeStereoWide(
    JNIEnv *, jobject, jfloat width) {

    EngineManager::get().setStereoWide(width);
}

JNIEXPORT void JNICALL
Java_com_pristineaudio_NativeDSPModule_setNativeBalance(
    JNIEnv *, jobject, jfloat balance) {

    EngineManager::get().setBalance(balance);
}

// ==========================================
// MODE CONTROL (CORE FEATURE)
// ==========================================

JNIEXPORT void JNICALL
Java_com_pristineaudio_NativeDSPModule_setProcessingMode(
    JNIEnv *, jobject, jint mode) {

    EngineManager::get().setProcessingMode(mode);
}

// ==========================================
// OPTIONAL
// ==========================================

JNIEXPORT void JNICALL
Java_com_pristineaudio_NativeDSPModule_toggleNativeExclusiveMode(
    JNIEnv *, jobject, jboolean enabled) {

    EngineManager::get().setExclusiveMode(enabled);
}

} 