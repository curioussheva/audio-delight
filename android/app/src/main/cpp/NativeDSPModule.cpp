#include <jni.h>
#include <android/log.h>
#include "AudioEngine.h"

extern AudioEngine *getAudioEngine(); 

extern "C" {

JNIEXPORT void JNICALL
Java_com_pristineaudio_NativeDSPModule_setNativeEqualizerBand(
    JNIEnv *env, jobject thiz, jint band, jfloat gainDb) {
    
    AudioEngine* engine = getAudioEngine();
    if (engine) engine->setEqBand(band, gainDb);
}

JNIEXPORT void JNICALL
Java_com_pristineaudio_NativeDSPModule_setNativeBassBoost(
    JNIEnv *env, jobject thiz, jfloat gainDb) {
    
    AudioEngine* engine = getAudioEngine();
    if (engine) engine->setBassBoost(gainDb);
}

JNIEXPORT void JNICALL
Java_com_pristineaudio_NativeDSPModule_setNativeMasterGain(
    JNIEnv *env, jobject thiz, jfloat gain) {
    
    AudioEngine* engine = getAudioEngine();
    if (engine) engine->setMasterGain(gain);
}

JNIEXPORT void JNICALL
Java_com_pristineaudio_NativeDSPModule_setNativeStereoWide(
    JNIEnv *env, jobject thiz, jfloat width) {
    
    AudioEngine* engine = getAudioEngine();
    if (engine) engine->setStereoWide(width);
}

JNIEXPORT void JNICALL
Java_com_pristineaudio_NativeDSPModule_setNativeBalance(
    JNIEnv *env, jobject thiz, jfloat balance) {
    
    AudioEngine* engine = getAudioEngine();
    if (engine) engine->setBalance(balance);
}

JNIEXPORT void JNICALL
Java_com_pristineaudio_NativeDSPModule_toggleNativeExclusiveMode(
    JNIEnv *env, jobject thiz, jboolean enabled) {
    
    AudioEngine* engine = getAudioEngine();
    if (engine) engine->setExclusiveMode(enabled);
}

} // extern "C"
