#include <jni.h>
#include "AudioEngine.h"

static AudioEngine *audioEngine = nullptr;

extern "C" {

JNIEXPORT void JNICALL
Java_com_pristineaudio_OboeAudioProcessor_feedNativeAudio(JNIEnv* env, jobject, jobject byteBuffer, jint size) {
    // Mendapatkan alamat memori langsung dari ByteBuffer Java tanpa penyalinan data
    float* data = (float*)env->GetDirectBufferAddress(byteBuffer);
    if (audioEngine && data) {
        // Kirim jumlah sampel (ukuran buffer dibagi 4 karena float = 4 byte)
        audioEngine->pushData(data, size / sizeof(float));
    }
}

// Gunakan fungsi initializeEngine yang sudah ada untuk membuat objek audioEngine
} 