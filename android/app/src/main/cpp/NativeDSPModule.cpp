#include <jni.h>
#include <android/log.h>
#include "AudioEngine.h"

// Mengambil fungsi Singleton dari native-lib.cpp
extern "C" {
    AudioEngine* getAudioEngine(); 
}

extern "C" {

JNIEXPORT void JNICALL
Java_com_pristineaudio_NativeDSPModule_setNativeEqualizerBand(
    JNIEnv *env, jobject thiz, jint band, jfloat gainDb) {
    
    getAudioEngine()->setEqBand(band, gainDb);
}

JNIEXPORT void JNICALL
Java_com_pristineaudio_NativeDSPModule_setNativeBassBoost(
    JNIEnv *env, jobject thiz, jfloat gainDb) {
    
    getAudioEngine()->setBassBoost(gainDb);
}

JNIEXPORT void JNICALL
Java_com_pristineaudio_NativeDSPModule_setNativeMasterGain(
    JNIEnv *env, jobject thiz, jfloat gain) {
    
    getAudioEngine()->setMasterGain(gain);
}

JNIEXPORT void JNICALL
Java_com_pristineaudio_NativeDSPModule_setNativeStereoWide(
    JNIEnv *env, jobject thiz, jfloat width) {
    
    getAudioEngine()->setStereoWide(width);
}

JNIEXPORT void JNICALL
Java_com_pristineaudio_NativeDSPModule_setNativeBalance(
    JNIEnv *env, jobject thiz, jfloat balance) {
    
    getAudioEngine()->setBalance(balance);
}

JNIEXPORT void JNICALL
Java_com_pristineaudio_NativeDSPModule_toggleNativeExclusiveMode(
    JNIEnv *env, jobject thiz, jboolean enabled) {
    
    getAudioEngine()->setExclusiveMode(enabled);
}

} // extern "C"
