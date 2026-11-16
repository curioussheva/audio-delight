// =====================================================
// spike/usb-direct/usb_direct_jni.cpp
// =====================================================
//
// Jembatan JNI untuk spike USB Direct — BELUM TERWIRING ke app.
// Dipakai oleh android/UsbDirectManager.kt (juga di folder spike).
//
//   Java_com_pristineaudio_usb_UsbDirectModule_nativeOpen
//   Java_com_pristineaudio_usb_UsbDirectModule_nativeStart
//   Java_com_pristineaudio_usb_UsbDirectModule_nativeStop
//   Java_com_pristineaudio_usb_UsbDirectModule_nativeClose
//   Java_com_pristineaudio_usb_UsbDirectModule_nativeGetStats
//
// Konvensi (mengikuti repo — J-M5 + B12-K1):
//   - Penamaan statis Java_<pkg>_<Class>_<method> (seperti
//     NativeDSPModule.cpp); tidak ada RegisterNatives.
//   - Semua body dibungkus guarded lokal (pola JniGuard.h) — exception
//     C++ TIDAK BOLEH lolos ke JNI (UB). Saat integrasi, ganti guard
//     lokal ini dengan jni/JniGuard.h.
//   - nativeOpen mengembalikan null bila sukses, atau STRING ERROR bila
//     gagal (Kotlin melempar dari string itu). fd MILIK
//     UsbDeviceConnection — native TIDAK PERNAH close fd.
//   - nativeGetStats mengembalikan JSON (string), null bila belum open.
//
// STATUS VERIFIKASI: file ini TIDAK BISA dikompilasi di VM Muse
// (tidak ada NDK/jni.h di sini). Syntax-check dilakukan dengan stub
// jni.h di /tmp (lihat README). Kompilasi nyata hanya di CI.
// JANGAN andalkan file ini sebelum CI hijau.
//
// SPDX-License-Identifier: MIT

#include <jni.h>

#include <cstdio>
#include <cstring>
#include <memory>
#include <mutex>

#include "usb_direct.h"
#include "usb_direct_stream.h"

#ifdef __ANDROID__
#include <android/log.h>
#define UD_LOG(...) __android_log_print(ANDROID_LOG_DEBUG, "UsbDirect", __VA_ARGS__)
#else
#define UD_LOG(...) ((void)0)
#endif

namespace {

// Guard lokal (pola JniGuard.h): tangkap exception C++, log, lempar
// RuntimeException Java bila belum ada exception pending.
template <typename F>
auto guarded(JNIEnv* env, const char* where, F&& f) -> decltype(f()) {
    try {
        return f();
    } catch (const std::exception& e) {
        UD_LOG("%s: exception C++: %s", where, e.what());
        if (env != nullptr && !env->ExceptionCheck()) {
            jclass exClass = env->FindClass("java/lang/RuntimeException");
            if (exClass != nullptr) {
                env->ThrowNew(exClass, where);
            }
        }
    } catch (...) {
        UD_LOG("%s: exception C++ tak dikenal", where);
        if (env != nullptr && !env->ExceptionCheck()) {
            jclass exClass = env->FindClass("java/lang/RuntimeException");
            if (exClass != nullptr) {
                env->ThrowNew(exClass, where);
            }
        }
    }
    return decltype(f()){};
}

struct Session {
    std::unique_ptr<pristine::usb::UsbDirectDevice> device;
    std::unique_ptr<pristine::usb::SineSource> sine;
};

std::mutex gMu;
std::unique_ptr<Session> gSession;

jstring toJString(JNIEnv* env, const char* s) {
    if (s == nullptr) return nullptr;
    // NewStringUTF bisa gagal (OOM) -> kembalikan null; exception
    // pending dibiarkan naik (J-M5).
    return env->NewStringUTF(s);
}

}  // namespace

extern "C" {

JNIEXPORT jstring JNICALL
Java_com_pristineaudio_usb_UsbDirectModule_nativeOpen(JNIEnv* env, jobject /*thiz*/,
                                                      jint fd, jint sampleRate,
                                                      jint channels, jint subslotSize,
                                                      jint bitResolution) {
    return guarded(env, "nativeOpen", [&]() -> jstring {
        std::lock_guard<std::mutex> lock(gMu);
        if (gSession) {
            return toJString(env, "sesi USB Direct sudah terbuka");
        }
        if (fd < 0) {
            return toJString(env, "fd tidak valid");
        }
        auto io = std::make_unique<pristine::usb::UsbdevfsIo>(static_cast<int>(fd));
        auto dev = std::make_unique<pristine::usb::UsbDirectDevice>(std::move(io));
        char err[256] = {};
        const int rc = dev->open(static_cast<uint32_t>(sampleRate),
                                 static_cast<uint8_t>(channels),
                                 static_cast<uint8_t>(subslotSize),
                                 static_cast<uint8_t>(bitResolution), err, sizeof(err));
        if (rc != 0) {
            return toJString(env, err[0] != '\0' ? err : "open gagal (tanpa pesan)");
        }
        auto session = std::make_unique<Session>();
        session->device = std::move(dev);
        gSession = std::move(session);
        UD_LOG("nativeOpen ok: %d Hz", static_cast<int>(sampleRate));
        return static_cast<jstring>(nullptr);  // sukses
    });
}

JNIEXPORT jboolean JNICALL
Java_com_pristineaudio_usb_UsbDirectModule_nativeStart(JNIEnv* env, jobject /*thiz*/,
                                                       jdouble freqHz, jdouble amplitude) {
    return guarded(env, "nativeStart", [&]() -> jboolean {
        std::lock_guard<std::mutex> lock(gMu);
        if (!gSession || !gSession->device || !gSession->device->isOpen()) {
            return JNI_FALSE;
        }
        const auto& choice = gSession->device->choice();
        gSession->sine = std::make_unique<pristine::usb::SineSource>(
            static_cast<double>(freqHz), static_cast<double>(choice.format.sampleRate),
            static_cast<double>(amplitude));
        pristine::usb::SineSource* sine = gSession->sine.get();
        const uint8_t channels = choice.format.channels;
        const uint8_t subslot = choice.format.subslotSize;
        const uint8_t bitRes = choice.format.bitResolution;
        auto source = [sine, channels, subslot, bitRes](uint8_t* out, size_t maxBytes) {
            const size_t frames = maxBytes / (static_cast<size_t>(channels) * subslot);
            return sine->fill(out, frames, channels, subslot, bitRes);
        };
        const int rc = gSession->device->startStreaming(std::move(source));
        return rc == 0 ? JNI_TRUE : JNI_FALSE;
    });
}

JNIEXPORT void JNICALL
Java_com_pristineaudio_usb_UsbDirectModule_nativeStop(JNIEnv* env, jobject /*thiz*/) {
    guarded(env, "nativeStop", [&] {
        std::lock_guard<std::mutex> lock(gMu);
        if (gSession && gSession->device) {
            gSession->device->stopStreaming();
        }
    });
}

JNIEXPORT void JNICALL
Java_com_pristineaudio_usb_UsbDirectModule_nativeClose(JNIEnv* env, jobject /*thiz*/) {
    guarded(env, "nativeClose", [&] {
        std::lock_guard<std::mutex> lock(gMu);
        if (gSession) {
            if (gSession->device) {
                gSession->device->close();
            }
            gSession.reset();
        }
    });
}

JNIEXPORT jstring JNICALL
Java_com_pristineaudio_usb_UsbDirectModule_nativeGetStats(JNIEnv* env, jobject /*thiz*/) {
    return guarded(env, "nativeGetStats", [&]() -> jstring {
        std::lock_guard<std::mutex> lock(gMu);
        if (!gSession || !gSession->device) {
            return toJString(env, "{}");
        }
        const pristine::usb::IsoStats st = gSession->device->stats();
        char json[512];
        std::snprintf(json, sizeof(json),
                      "{\"urbsSubmitted\":%llu,\"urbsCompleted\":%llu,"
                      "\"packetsCompleted\":%llu,\"bytesSent\":%llu,"
                      "\"urbErrors\":%llu,\"shortPackets\":%llu,"
                      "\"underruns\":%llu,\"framesSent\":%llu}",
                      (unsigned long long)st.urbsSubmitted,
                      (unsigned long long)st.urbsCompleted,
                      (unsigned long long)st.packetsCompleted,
                      (unsigned long long)st.bytesSent,
                      (unsigned long long)st.urbErrors,
                      (unsigned long long)st.shortPackets,
                      (unsigned long long)st.underruns,
                      (unsigned long long)st.framesSent);
        return toJString(env, json);
    });
}

}  // extern "C"
