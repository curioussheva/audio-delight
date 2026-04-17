#include <jni.h>
#include <android/log.h>
#include "AudioEngine.h"

#define LOG_TAG "NativeDSP"
#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, LOG_TAG, __VA_ARGS__)

// Helper dari Native-lib.cpp
extern AudioEngine* getAudioEngine();

extern "C" {

// ==================== EQUALIZER ====================
JNIEXPORT void JNICALL
Java_com_pristineaudio_NativeDSPModule_setNativeEqualizerBand(
    JNIEnv *env, jobject thiz, jint band_index, jfloat gain) {
    
    LOGD("Setting EQ Band %d to %.2f dB", band_index, gain);
    
    AudioEngine* engine = getAudioEngine();
    if (engine != nullptr) {
        engine->setEqualizerBand(band_index, gain);
    }
}

// ==================== BASS BOOST ====================
JNIEXPORT void JNICALL
Java_com_pristineaudio_NativeDSPModule_setNativeBassBoost(
    JNIEnv *env, jobject thiz, jfloat intensity) {
    
    LOGD("Setting Bass Boost intensity to %.2f", intensity);
    
    AudioEngine* engine = getAudioEngine();
    if (engine != nullptr) {
        engine->setBassBoost(intensity);
    }
}

// ==================== EXCLUSIVE MODE ====================
JNIEXPORT void JNICALL
Java_com_pristineaudio_NativeDSPModule_toggleNativeExclusiveMode(
    JNIEnv *env, jobject thiz, jboolean enabled) {
    
    LOGD("Exclusive Mode Toggled: %s", enabled ? "ON" : "OFF");
    
    AudioEngine* engine = getAudioEngine();
    if (engine != nullptr) {
        engine->setExclusiveMode(enabled);
    }
}

} // extern "C" 