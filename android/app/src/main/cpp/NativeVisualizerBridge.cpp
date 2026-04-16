#include <jni.h>
#include <vector>
#include "AudioEngine.h" // Pastikan header engine kamu diinclude

extern "C"
JNIEXPORT jfloatArray JNICALL
Java_com_pristineaudio_NativeVisualizerModule_getVisualizerData(JNIEnv *env, jobject thiz) {
    // Contoh mengambil data FFT (asumsi data ada di AudioEngine)
    // Di Fase 4 nanti, kita akan isi dengan algoritma FFT sesungguhnya
    std::vector<float> fftData(128, 0.0f); 
    
    jfloatArray result = env->NewFloatArray(fftData.size());
    env->SetFloatArrayRegion(result, 0, fftData.size(), fftData.data());
    return result;
}
