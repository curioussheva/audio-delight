// =====================================================
// jni/NativeUsbDirect.cpp
// =====================================================
//
// Jembatan JNI untuk USB Direct — pasangan Kotlin
// com.pristineaudio.usb.UsbDirectManager (lihat
// scripts/check_jni_pairs.py: pasangan ini TERDAFTAR di sana, jadi
// salah nama ketahuan sebelum commit).
//
//   Java_com_pristineaudio_usb_UsbDirectManager_nativeUsbOpen
//   Java_com_pristineaudio_usb_UsbDirectManager_nativeUsbStart
//   Java_com_pristineaudio_usb_UsbDirectManager_nativeUsbStop
//   Java_com_pristineaudio_usb_UsbDirectManager_nativeUsbIsActive
//   Java_com_pristineaudio_usb_UsbDirectManager_nativeUsbGetStats
//
// Konvensi (mengikuti repo — J-M5 + B12-K1):
//   - Penamaan statis Java_<pkg>_<Class>_<method> (seperti
//     NativeDSPModule.cpp); tidak ada RegisterNatives.
//   - Semua body dibungkus pristine::jni::guarded/guardedVoid (JniGuard.h)
//     — exception C++ TIDAK BOLEH lolos ke JNI (UB).
//   - nativeUsbOpen mengembalikan null bila sukses, atau STRING ERROR bila
//     gagal (Kotlin menampilkan string itu). fd MILIK UsbDeviceConnection
//     — native TIDAK PERNAH close fd.
//   - nativeUsbGetStats mengembalikan JSON (string).
//
// Diadaptasi dari spike/usb-direct/usb_direct_jni.cpp (sine diganti render
// engine — lihat EngineManager::usbDirectStart): spike memakai sesi global
// sendiri + SineSource; produksi memakai EngineManager (satu pemilik
// output + invarian satu render thread).
//
// SPDX-License-Identifier: MIT

#include <jni.h>

#include <string>

#include "JniGuard.h"
#include "../manager/EngineManager.h"

namespace {

jstring toJString(JNIEnv* env, const char* s) {
    if (s == nullptr) return nullptr;
    // NewStringUTF bisa gagal (OOM) -> kembalikan null; exception
    // pending dibiarkan naik (J-M5).
    return env->NewStringUTF(s);
}

}  // namespace

extern "C" {

JNIEXPORT jstring JNICALL
Java_com_pristineaudio_usb_UsbDirectManager_nativeUsbOpen(
    JNIEnv* env,
    jobject,
    jint fd,
    jint sampleRate
) {
    return pristine::jni::guarded<jstring>(
        env, "nativeUsbOpen", nullptr, [&]() -> jstring {
            std::string error;
            const bool ok = EngineManager::get().usbDirectOpen(
                static_cast<int>(fd),
                static_cast<int32_t>(sampleRate),
                error
            );
            if (!ok) {
                return toJString(env, error.empty()
                    ? "open USB Direct gagal (tanpa pesan)"
                    : error.c_str());
            }
            return static_cast<jstring>(nullptr);  // sukses
        });
}

JNIEXPORT jboolean JNICALL
Java_com_pristineaudio_usb_UsbDirectManager_nativeUsbStart(
    JNIEnv* env,
    jobject
) {
    return pristine::jni::guarded<jboolean>(
        env, "nativeUsbStart", JNI_FALSE, [&]() -> jboolean {
            return EngineManager::get().usbDirectStart()
                ? JNI_TRUE
                : JNI_FALSE;
        });
}

JNIEXPORT void JNICALL
Java_com_pristineaudio_usb_UsbDirectManager_nativeUsbStop(
    JNIEnv* env,
    jobject
) {
    pristine::jni::guardedVoid(env, "nativeUsbStop", [&] {
        EngineManager::get().usbDirectStop();
    });
}

JNIEXPORT jboolean JNICALL
Java_com_pristineaudio_usb_UsbDirectManager_nativeUsbIsActive(
    JNIEnv* env,
    jobject
) {
    return pristine::jni::guarded<jboolean>(
        env, "nativeUsbIsActive", JNI_FALSE, [&]() -> jboolean {
            return EngineManager::get().isUsbDirectActive()
                ? JNI_TRUE
                : JNI_FALSE;
        });
}

JNIEXPORT jstring JNICALL
Java_com_pristineaudio_usb_UsbDirectManager_nativeUsbGetStats(
    JNIEnv* env,
    jobject
) {
    return pristine::jni::guarded<jstring>(
        env, "nativeUsbGetStats", nullptr, [&]() -> jstring {
            const std::string stats =
                EngineManager::get().usbDirectStatsJson();
            return toJString(env, stats.c_str());
        });
}

}  // extern "C"
