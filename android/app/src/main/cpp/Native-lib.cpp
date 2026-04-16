#include <jni.h>
#include "AudioEngine.h"

static AudioEngine *engine = new AudioEngine();

extern "C"
JNIEXPORT void JNICALL
Java_com_pristineaudio_NativeDSPModule_bootEngine(JNIEnv *env, jobject thiz) {
    engine->start();
}

extern "C"
JNIEXPORT void JNICALL
Java_com_pristineaudio_OboeAudioProcessor_feedNativeAudio(JNIEnv *env, jobject thiz, jfloatArray data, jint num_samples) {
    jfloat *samples = env->GetFloatArrayElements(data, nullptr);
    engine->pushData(samples, num_samples);
    env->ReleaseFloatArrayElements(data, samples, JNI_ABORT);
}
 