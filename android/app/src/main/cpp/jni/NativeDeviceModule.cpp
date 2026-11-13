#include "NativeDeviceModule.h"
#include "JniGuard.h"
#include "core/JniContext.h"
#include "devices/AudioDeviceManager.h"
#include "manager/EngineManager.h"
#include <vector>
#include <android/log.h>
#include <cstdlib>

extern "C" {

// (C-HIDDEN, 2026-11-12): satu-satunya init Context native. Dipanggil sekali
// dari NativeDeviceModule.initialize() dengan applicationContext —
// JNI_OnLoad TIDAK BISA menyediakan Context (hanya menerima JavaVM), jadi
// global ref harus datang dari panggilan Kotlin ini. Native menyimpan
// global ref-nya (first-wins, idempotent) dan AudioDeviceManager +
// ContentUriResolver memakainya sebagai pengganti
// ActivityThread.currentApplication() (@hide / non-SDK).
//
// Urutan boot: modul-modul legacy dibuat dari PristineAudioPackage saat
// bridge dibuat, dan initialize() dipanggil sebelum method apa pun di modul
// itu bisa didispatch — jadi dalam urutan normal init ini berjalan sebelum
// refreshDevices() pertama (nativeGetDevices, AudioDeviceCallback,
// EngineManager::start) maupun ContentUriResolver::resolve() pertama.
// Kalau toh ada jalur yang mendahului init (mis. pembuatan modul malas di
// masa depan), kedua pemakai gagal aman (return 0 / "") dengan log, bukan
// crash.
JNIEXPORT void JNICALL Java_com_pristineaudio_audio_NativeDeviceModule_nativeInitAppContext(JNIEnv* env, jobject, jobject context) {
    pristine::jni::guardedVoid(env, "nativeInitAppContext", [&] {
    if (!context) {
        __android_log_print(ANDROID_LOG_ERROR, "NativeDeviceModule",
                            "nativeInitAppContext: context null, diabaikan");
        return;
    }
    pristine::jni::setAppContext(env, context);
    });
}

JNIEXPORT jobjectArray JNICALL Java_com_pristineaudio_audio_NativeDeviceModule_nativeGetDevices(JNIEnv* env, jobject) {
    return pristine::jni::guarded<jobjectArray>(env, "nativeGetDevices", nullptr, [&]() -> jobjectArray {
    auto& mgr = pristine::AudioDeviceManager::get();

    // Baca ulang dari Android supaya device yang baru dicolok ikut terlihat.
    // Sebelumnya fungsi ini mengembalikan array KOSONG tanpa membaca apa pun.
    const int count = mgr.refreshDevices();
    auto devices = mgr.getAvailableDevices();

    jclass deviceClass = env->FindClass("com/pristineaudio/audio/AudioDeviceInfo");
    if (!deviceClass) {
        __android_log_print(ANDROID_LOG_ERROR, "NativeDeviceModule",
                            "nativeGetDevices: kelas AudioDeviceInfo tidak ditemukan");
        // 🔥 FIX (2026-11-11, J-M5): FindClass yang gagal meninggalkan
        // exception pending — FindClass berikutnya jadi no-op dan
        // NewObjectArray(0, null) mengembalikan null ke Kotlin yang
        // mengharapkan Array<Any> (NPE di devices.size). Bersihkan dulu.
        env->ExceptionClear();
        return env->NewObjectArray(0, env->FindClass("java/lang/Object"), nullptr);
    }

    // Konstruktor Kotlin: AudioDeviceInfo(id, name, type, sampleRate, exclusive)
    jmethodID ctor = env->GetMethodID(deviceClass, "<init>",
        "(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;IZ)V");
    if (!ctor) {
        __android_log_print(ANDROID_LOG_ERROR, "NativeDeviceModule",
                            "nativeGetDevices: konstruktor AudioDeviceInfo tidak cocok");
        env->ExceptionClear(); // GetMethodID gagal = NoSuchMethodError pending
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

        // 🔥 FIX (2026-11-11, J-m11): satu NewStringUTF yang gagal
        // meninggalkan exception pending → sisa loop jadi no-op dan array
        // penuh null. Bersihkan + lewati entri yang gagal.
        if (env->ExceptionCheck()) {
            env->ExceptionClear();
            obj = nullptr;
        }

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
    });
}

// Dipanggil dari AudioDeviceCallback (Kotlin) saat device dicolok.
//
// Tanpa ini, DAC yang dicolok saat app berjalan tidak terdeteksi dan laju
// stream tetap memakai device lama - bit-perfect gagal secara diam-diam.
JNIEXPORT void JNICALL Java_com_pristineaudio_audio_NativeDeviceModule_nativeOnDeviceAdded(JNIEnv* env, jobject, jstring deviceId) {
    pristine::jni::guardedVoid(env, "nativeOnDeviceAdded", [&] {
    if (!deviceId) return;
    const char* id = env->GetStringUTFChars(deviceId, nullptr);
    if (!id) return;
    __android_log_print(ANDROID_LOG_INFO, "NativeDeviceModule",
                        "nativeOnDeviceAdded('%s') dari AudioDeviceCallback", id);

    // FIX (DV-M3, 2026-11-11): sebelumnya descriptor KOSONG (id "",
    // type BUILTIN_SPEAKER, 48000) yang dioper ke notifyDeviceAdded —
    // log + payload callback mOnPlugged berisi sampah. Sekarang: refresh
    // daftar, cari device berdasarkan id, oper descriptor aslinya.
    auto& mgr = pristine::AudioDeviceManager::get();
    mgr.refreshDevices();
    pristine::AudioDeviceDescriptor d;
    bool found = false;
    for (const auto& cand : mgr.getAvailableDevices()) {
        if (cand.id == id) { d = cand; found = true; break; }
    }
    env->ReleaseStringUTFChars(deviceId, id);

    // 🔥 FIX (2026-11-11, J-m1 — sisa DV-M3): bila id tak ditemukan,
    // JANGAN panggil notifyDeviceAdded dengan descriptor default
    // (id "", BUILTIN_SPEAKER, 48000) — log + payload callback berisi
    // sampah. Return dini; refresh di atas sudah cukup.
    if (!found) {
        __android_log_print(ANDROID_LOG_WARN, "NativeDeviceModule",
                            "nativeOnDeviceAdded: id tidak ada di daftar sesudah refresh, abaikan");
        return;
    }

    // Manager melakukan refresh lagi (idempotent) + memanggil callback
    // terdaftar sendiri.
    mgr.notifyDeviceAdded(d);
    });
}

JNIEXPORT void JNICALL Java_com_pristineaudio_audio_NativeDeviceModule_nativeOnDeviceRemoved(JNIEnv* env, jobject, jstring deviceId) {
    pristine::jni::guardedVoid(env, "nativeOnDeviceRemoved", [&] {
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
    });
}

JNIEXPORT jboolean JNICALL Java_com_pristineaudio_audio_NativeDeviceModule_nativeSetActiveDevice(JNIEnv* env, jobject, jstring deviceId) {
    return pristine::jni::guarded<jboolean>(env, "nativeSetActiveDevice", JNI_FALSE, [&]() -> jboolean {
    // null = lepas preferensi (biarkan sistem memilih). String kosong juga.
    // B12-W1: teruskan ke engine juga — tanpa ini mRequestedDeviceId tetap
    // berisi id lama dan stream tetap di perangkat lama.
    if (!deviceId) {
        const bool ok = pristine::AudioDeviceManager::get().setActiveDevice("");
        return (ok && pristine::EngineManager::get().setRequestedDeviceId(0))
            ? JNI_TRUE : JNI_FALSE;
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

    // 🔥 FIX (2026-11-11, J-m5): kembalikan ok && applied. Sebelumnya
    // applied=false hanya di-log; JS promise resolve true sementara
    // stream tak pindah (engine menolak id — mis. device dicabut di
    // antara validasi manager dan engine).
    bool applied = false;
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

        applied =
            pristine::EngineManager::get().setRequestedDeviceId(numericId);

        __android_log_print(ANDROID_LOG_INFO, "NativeDeviceModule",
                            "nativeSetActiveDevice: diteruskan ke engine id=%d -> %s",
                            numericId, applied ? "BERLAKU" : "DITOLAK");
    }

    env->ReleaseStringUTFChars(deviceId, id);
    return (ok && applied) ? JNI_TRUE : JNI_FALSE;
    });
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
    return pristine::jni::guarded<jintArray>(env, "nativeGetActiveDeviceStatus", nullptr, [&]() -> jintArray {
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
    });
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
    return pristine::jni::guarded<jobject>(env, "nativeGetCurrentOutputDevice", nullptr, [&]() -> jobject {
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

    // 🔥 FIX (2026-11-11, J-m10): NewStringUTF yang gagal meninggalkan
    // exception pending → NewObject jadi no-op. Kotlin sudah menangani
    // null di jalur ini (return nullptr), jadi bersihkan + return null.
    if (env->ExceptionCheck()) {
        env->ExceptionClear();
        return nullptr;
    }

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
    });
}

} // extern "C"