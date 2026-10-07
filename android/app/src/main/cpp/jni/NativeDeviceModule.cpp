#include "NativeDeviceModule.h"
#include "devices/AudioDeviceManager.h"
#include "manager/EngineManager.h"
#include <vector>
#include <android/log.h>
#include <cstdlib>

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

        // Manager dulu: refresh daftar device dan lepas preferensi kalau device
        // aktif yang dicabut.
        pristine::AudioDeviceManager::get().notifyDeviceRemoved(id);

        // Lalu engine: stream yang SEDANG berjalan masih menunjuk device itu -
        // audio berhenti / keluar di perangkat hantu sampai ada yang membuka
        // ulang stream. EngineManager yang tahu device mana yang sedang
        // dipakai, jadi pemberitahuannya diteruskan ke sana.
        if (id[0] != '\0') {
            const int32_t numericId =
                static_cast<int32_t>(std::strtol(id, nullptr, 10));
            if (numericId > 0) {
                pristine::EngineManager::get().onDeviceRemoved(numericId);
            }
        }

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

    if (ok) {
        // 🔥 FIX (2026-10-07): teruskan pilihan device ke engine.
        //
        // Sebelumnya setActiveDevice() hanya mencatat di AudioDeviceManager.
        // Tidak ada yang membaca catatan itu saat stream dibuka, jadi memilih
        // DAC tidak mengubah apa pun dan audio tetap keluar dari speaker.
        //
        // Di sini id diterjemahkan ke numerik dan diteruskan ke EngineManager,
        // yang menutup dan membuka ulang stream di perangkat itu. Tanpa baris
        // ini seluruh pemilihan device hanya kosmetik.
        const int32_t numericId = (id[0] == '\0')
            ? 0
            : static_cast<int32_t>(std::strtol(id, nullptr, 10));

        const bool applied =
            pristine::EngineManager::get().setRequestedDeviceId(numericId);

        __android_log_print(ANDROID_LOG_INFO, "NativeDeviceModule",
                            "nativeSetActiveDevice: diteruskan ke engine id=%d -> %s",
                            numericId, applied ? "BERLAKU" : "DITOLAK");
    }

    env->ReleaseStringUTFChars(deviceId, id);
    return ok ? JNI_TRUE : JNI_FALSE;
}

// Status perangkat yang BENAR-BENAR dipakai stream, untuk kejujuran UI.
//
// Mengembalikan array [requested, actual, honored, pathLossy, rateHonored] sebagai int:
//   [0] id yang diminta (0 = tidak ada preferensi)
//   [1] id yang benar-benar dipakai stream (0 = dipilih sistem)
//   [2] 1 kalau permintaan device dihormati, 0 kalau tidak
//   [3] 1 kalau jalur ini memang TIDAK BISA bit-perfect (speaker internal,
//       jack, Bluetooth, OpenSLES), 0 kalau secara arsitektur mungkin
//   [4] 1 kalau laju stream yang berjalan sama dengan laju file (tidak ada
//       konversi), 0 kalau tidak / laju file tidak diketahui
//
// Tanpa ini UI tidak bisa membedakan "sedang memakai DAC" dari "mengira
// memakai DAC" - dan menampilkan badge bit-perfect yang salah.
JNIEXPORT jintArray JNICALL Java_com_pristineaudio_audio_NativeDeviceModule_nativeGetActiveDeviceStatus(JNIEnv* env, jobject) {
    auto& engine = pristine::EngineManager::get();

    jint values[5];
    values[0] = static_cast<jint>(engine.requestedDeviceId());
    values[1] = static_cast<jint>(engine.actualDeviceId());
    values[2] = engine.isDeviceHonored() ? 1 : 0;
    values[3] = engine.isPathInherentlyLossy() ? 1 : 0;
    values[4] = engine.isRateHonored() ? 1 : 0;

    jintArray result = env->NewIntArray(5);
    if (result) {
        env->SetIntArrayRegion(result, 0, 5, values);
    }
    return result;
}

// Perangkat yang SEDANG dipakai stream, sebagai objek AudioDeviceInfo.
//
// null kalau stream memilih sendiri (id 0) atau belum dibuka - dalam keadaan
// itu tidak ada perangkat spesifik yang boleh disebut UI.
//
// Beda dari nativeGetDevices(): yang ini mengembalikan SATU perangkat, dan
// itu perangkat yang benar-benar mengeluarkan suara - bukan daftar yang
// tersedia. Kalau permintaan DAC tidak dihormati, yang dikembalikan adalah
// speaker internal, dan UI jadi tidak bisa menyebut nama DAC.
JNIEXPORT jobject JNICALL Java_com_pristineaudio_audio_NativeDeviceModule_nativeGetCurrentOutputDevice(JNIEnv* env, jobject) {
    const auto device = pristine::EngineManager::get().currentOutputDevice();

    if (device.id.empty()) {
        return nullptr;
    }

    jclass deviceClass = env->FindClass("com/pristineaudio/audio/AudioDeviceInfo");
    if (!deviceClass) {
        __android_log_print(ANDROID_LOG_ERROR, "NativeDeviceModule",
                            "nativeGetCurrentOutputDevice: kelas AudioDeviceInfo tidak ditemukan");
        return nullptr;
    }

    jmethodID ctor = env->GetMethodID(deviceClass, "<init>",
        "(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;IZ)V");
    if (!ctor) {
        __android_log_print(ANDROID_LOG_ERROR, "NativeDeviceModule",
                            "nativeGetCurrentOutputDevice: konstruktor AudioDeviceInfo tidak cocok");
        return nullptr;
    }

    jstring jid   = env->NewStringUTF(device.id.c_str());
    jstring jname = env->NewStringUTF(device.name.c_str());
    jstring jtype = env->NewStringUTF(pristine::deviceTypeName(device.type));

    jobject obj = env->NewObject(deviceClass, ctor,
        jid, jname, jtype,
        static_cast<jint>(device.preferredSampleRate),
        device.supportsExclusive ? JNI_TRUE : JNI_FALSE);

    env->DeleteLocalRef(jid);
    env->DeleteLocalRef(jname);
    env->DeleteLocalRef(jtype);

    __android_log_print(ANDROID_LOG_INFO, "NativeDeviceModule",
                        "nativeGetCurrentOutputDevice: id=%s name=\"%s\" type=%s",
                        device.id.c_str(), device.name.c_str(),
                        pristine::deviceTypeName(device.type));

    return obj;
}

} // extern "C"