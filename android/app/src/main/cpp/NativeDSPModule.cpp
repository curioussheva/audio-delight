#include <jni.h>
#include <android/log.h>

#define LOG_TAG "NativeDSP"
#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, LOG_TAG, __VA_ARGS__)

extern "C"
JNIEXPORT void JNICALL
Java_com_pristineaudio_NativeDSPModule_setNativeEqualizerBand(JNIEnv *env, jobject thiz, jint band_index, jfloat gain) {
    LOGD("Setting EQ Band %d to %f dB", band_index, gain);
    // TODO: Kirim nilai gain ke Biquad Filter di AudioEngine
}

extern "C"
JNIEXPORT void JNICALL
Java_com_pristineaudio_NativeDSPModule_setNativeBassBoost(JNIEnv *env, jobject thiz, jfloat intensity) {
    LOGD("Setting Bass Boost intensity to %f", intensity);
    // TODO: Update low-pass filter shelving gain
}
