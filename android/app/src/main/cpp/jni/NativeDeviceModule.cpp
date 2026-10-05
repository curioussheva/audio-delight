#include "NativeDeviceModule.h"
#include "devices/AudioDeviceManager.h"
#include <vector>
#include <android/log.h>

extern "C" {

JNIEXPORT jobjectArray JNICALL Java_com_pristineaudio_audio_NativeDeviceModule_nativeGetDevices(JNIEnv* env, jobject) {
    auto& mgr = pristine::AudioDeviceManager::get();

    // Baca ulang dari Android supaya device yang baru dicolok ikut terlihat.
    // Sebelumnya fungsi ini mengembalikan array KOSONG tanpa membaca apa pun.
    const int count = mgr.refreshDevices();
    auto devices = mgr.getAvailableDevices();

    jclass deviceClass = env->FindClass("com/pristineaudio/audio/AudioDeviceInfo");
    if (!deviceClass) {
        __android_log_print(ANDROID_LOG_ERROR, "NativeDeviceModule",
                            "nativeGetDevices: kelas AudioDeviceInfo tidak ditemukan");
        return env->NewObjectArray(0, env->FindClass("java/lang/Object"), nullptr);
    }

    // Konstruktor Kotlin: AudioDeviceInfo(id, name, type, sampleRate, exclusive)
    jmethodID ctor = env->GetMethodID(deviceClass, "<init>",
        "(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;IZ)V");
    if (!ctor) {
        __android_log_print(ANDROID_LOG_ERROR, "NativeDeviceModule",
                            "nativeGetDevices: konstruktor AudioDeviceInfo tidak cocok");
        return env->NewObjectArray(0, deviceClass, nullptr);
    }

    jobjectArray result = env->NewObjectArray(
        static_cast<jsize>(devices.size()), deviceClass, nullptr);

    for (size_t i = 0; i < devices.size(); ++i) {
        const auto& d = devices[i];
        jstring jid   = env->NewStringUTF(d.id.c_str());
        jstring jname = env->NewStringUTF(d.name.c_str());
        jstring jtype = env->NewStringUTF(pristine::deviceTypeName(d.type));

        jobject obj = env->NewObject(deviceClass, ctor,
            jid, jname, jtype,
            static_cast<jint>(d.preferredSampleRate),
            d.supportsExclusive ? JNI_TRUE : JNI_FALSE);

        if (obj) env->SetObjectArrayElement(result, static_cast<jsize>(i), obj);

        env->DeleteLocalRef(jid);
        env->DeleteLocalRef(jname);
        env->DeleteLocalRef(jtype);
        if (obj) env->DeleteLocalRef(obj);
    }

    __android_log_print(ANDROID_LOG_INFO, "NativeDeviceModule",
                        "nativeGetDevices: mengembalikan %d device (refresh=%d)",
                        (int)devices.size(), count);
    return result;
}

// Dipanggil dari AudioDeviceCallback (Kotlin) saat device dicolok.
//
// Tanpa ini, DAC yang dicolok saat app berjalan tidak terdeteksi dan laju
// stream tetap memakai device lama - bit-perfect gagal secara diam-diam.
JNIEXPORT void JNICALL Java_com_pristineaudio_audio_NativeDeviceModule_nativeOnDeviceAdded(JNIEnv* env, jobject, jstring deviceId) {
    if (!deviceId) return;
    const char* id = env->GetStringUTFChars(deviceId, nullptr);
    if (id) {
        __android_log_print(ANDROID_LOG_INFO, "NativeDeviceModule",
                            "nativeOnDeviceAdded('%s') dari AudioDeviceCallback", id);
        env->ReleaseStringUTFChars(deviceId, id);
    }
    // Manager melakukan refresh + memanggil callback terdaftar sendiri.
    pristine::AudioDeviceDescriptor d;
    pristine::AudioDeviceManager::get().notifyDeviceAdded(d);
}

JNIEXPORT void JNICALL Java_com_pristineaudio_audio_NativeDeviceModule_nativeOnDeviceRemoved(JNIEnv* env, jobject, jstring deviceId) {
    if (!deviceId) return;
    const char* id = env->GetStringUTFChars(deviceId, nullptr);
    if (id) {
        __android_log_print(ANDROID_LOG_INFO, "NativeDeviceModule",
                            "nativeOnDeviceRemoved('%s') dari AudioDeviceCallback", id);
        pristine::AudioDeviceManager::get().notifyDeviceRemoved(id);
        env->ReleaseStringUTFChars(deviceId, id);
    }
}

JNIEXPORT jboolean JNICALL Java_com_pristineaudio_audio_NativeDeviceModule_nativeSetActiveDevice(JNIEnv* env, jobject, jstring deviceId) {
    // null = lepas preferensi (biarkan sistem memilih). String kosong juga.
    if (!deviceId) {
        return pristine::AudioDeviceManager::get().setActiveDevice("") ? JNI_TRUE : JNI_FALSE;
    }

    const char* id = env->GetStringUTFChars(deviceId, nullptr);
    if (!id) {
        __android_log_print(ANDROID_LOG_ERROR, "NativeDeviceModule",
                            "nativeSetActiveDevice: gagal membaca deviceId");
        return JNI_FALSE;
    }

    // Mengembalikan hasil NYATA dari manager: false kalau id tidak ada di
    // daftar device. Sebelumnya manager selalu mengembalikan true sehingga
    // pemanggil mengira berhasil padahal tidak ada yang berubah.
    const bool ok = pristine::AudioDeviceManager::get().setActiveDevice(id);

    __android_log_print(ANDROID_LOG_INFO, "NativeDeviceModule",
                        "nativeSetActiveDevice('%s') -> %s", id, ok ? "OK" : "DITOLAK");

    env->ReleaseStringUTFChars(deviceId, id);
    return ok ? JNI_TRUE : JNI_FALSE;
}

} // extern "C"