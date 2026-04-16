#include <jni.h>
#include <android/log.h>
#include "AudioEngine.h" // File header mesin audio Anda

#define LOG_TAG "NativeDSP"
#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, LOG_TAG, __VA_ARGS__)

// Kita asumsikan engine dikelola secara global atau singleton
extern AudioEngine *gAudioEngine; 

extern "C" {

// PERHATIKAN: Nama fungsi harus mengikuti struktur Java_package_class_function
// Jika package Anda: com.pristineaudio.app, maka titik diganti garis bawah.

JNIEXPORT void JNICALL
Java_com_pristineaudio_app_NativeDSPModule_setNativeEqualizerBand(
    JNIEnv *env, jobject thiz, jint band_index, jfloat gain) {
    
    LOGD("Setting EQ Band %d to %f dB", band_index, gain);
    
    if (gAudioEngine != nullptr) {
        // Memanggil fungsi internal di C++ untuk update koefisien filter
        gAudioEngine->setEqualizerBand(band_index, gain);
    }
}

JNIEXPORT void JNICALL
Java_com_pristineaudio_app_NativeDSPModule_setNativeBassBoost(
    JNIEnv *env, jobject thiz, jfloat intensity) {
    
    LOGD("Setting Bass Boost intensity to %f", intensity);
    
    if (gAudioEngine != nullptr) {
        gAudioEngine->setBassBoost(intensity);
    }
}

JNIEXPORT void JNICALL
Java_com_pristineaudio_app_NativeDSPModule_toggleNativeExclusiveMode(
    JNIEnv *env, jobject thiz, jboolean enabled) {
    
    LOGD("Exclusive Mode Toggled: %s", enabled ? "ON" : "OFF");
    
    if (gAudioEngine != nullptr) {
        // Restart stream Oboe dengan SharingMode::Exclusive
        gAudioEngine->setExclusiveMode(enabled);
    }
}

} // extern "C"
 