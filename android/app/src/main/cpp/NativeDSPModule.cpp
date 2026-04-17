#include <jni.h>
#include <android/log.h>
#include "AudioEngine.h"

#define LOG_TAG "NativeDSP"
#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, LOG_TAG, __VA_ARGS__)

// Global pointer dari AudioEngine.cpp (paling penting!)
extern AudioEngine* gAudioEngine;

extern "C" {

// ==================== EQUALIZER ====================
JNIEXPORT void JNICALL
Java_com_pristineaudio_NativeDSPModule_setNativeEqualizerBand(
    JNIEnv *env, jobject thiz, jint band_index, jfloat gain) {
    
    LOGD("Setting EQ Band %d to %.2f dB", band_index, gain);
    
    if (gAudioEngine != nullptr) {
        gAudioEngine->setEqualizerBand(band_index, gain);
    }
}

// ==================== BASS BOOST ====================
JNIEXPORT void JNICALL
Java_com_pristineaudio_NativeDSPModule_setNativeBassBoost(
    JNIEnv *env, jobject thiz, jfloat intensity) {
    
    LOGD("Setting Bass Boost intensity to %.2f", intensity);
    
    if (gAudioEngine != nullptr) {
        gAudioEngine->setBassBoost(intensity);
    }
}

// ==================== REVERB ====================
JNIEXPORT void JNICALL
Java_com_pristineaudio_NativeDSPModule_setNativeReverb(
    JNIEnv *env, jobject thiz, jfloat amount) {
    
    LOGD("Setting Reverb to %.2f", amount);
    
    if (gAudioEngine != nullptr) {
        gAudioEngine->setReverb(amount);
    }
}

// ==================== SOUND STAGE ====================
JNIEXPORT void JNICALL
Java_com_pristineaudio_NativeDSPModule_setNativeSoundStage(
    JNIEnv *env, jobject thiz, jfloat width) {
    
    LOGD("Setting Sound Stage width to %.2f", width);
    
    if (gAudioEngine != nullptr) {
        gAudioEngine->setSoundStage(width);
    }
}

// ==================== MASTER VOLUME ====================
JNIEXPORT void JNICALL
Java_com_pristineaudio_NativeDSPModule_setNativeMasterVolume(
    JNIEnv *env, jobject thiz, jfloat volume) {
    
    LOGD("Setting Master Volume to %.2f", volume);
    
    if (gAudioEngine != nullptr) {
        gAudioEngine->setMasterVolume(volume);
    }
}

// ==================== BALANCE ====================
JNIEXPORT void JNICALL
Java_com_pristineaudio_NativeDSPModule_setNativeBalance(
    JNIEnv *env, jobject thiz, jfloat balance) {
    
    LOGD("Setting Balance to %.2f", balance);
    
    if (gAudioEngine != nullptr) {
        gAudioEngine->setBalance(balance);
    }
}

// ==================== EXCLUSIVE MODE ====================
JNIEXPORT void JNICALL
Java_com_pristineaudio_NativeDSPModule_toggleNativeExclusiveMode(
    JNIEnv *env, jobject thiz, jboolean enabled) {
    
    LOGD("Exclusive Mode Toggled: %s", enabled ? "ON" : "OFF");
    
    if (gAudioEngine != nullptr) {
        gAudioEngine->setExclusiveMode(enabled);
    }
}

} // extern "C" 