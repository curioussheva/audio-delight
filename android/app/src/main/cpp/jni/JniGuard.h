#pragma once

// jni/JniGuard.h
//
// Guard seragam per-fungsi JNI (B12-K1).
//
// Masalah: exception C++ yang lolos dari fungsi Java_* ke JNI adalah UB —
// runtime tidak menjamin apa pun (praktiknya abort/crash, tanpa jejak yang
// berguna). Sebelum guard ini, TIDAK ADA SATU PUN fungsi JNI di cpp/ yang
// memakai try/catch, jadi semua jalur sekaligus terbuka: bad_alloc dari
// alokasi di nativeSetQueue, throw dari DecoderWorker::start() / advanceWorker_
// di initialize(), sampai throw dari pemanggil mana pun di bawah JNI.
//
// Pola pakai — bungkus SELURUH body fungsi Java_* dalam lambda, tanpa
// mengubah satu baris logika di dalamnya (return di dalam body menjadi
// return dari lambda, lalu diteruskan guarded sebagai nilai kembali):
//
//   JNIEXPORT jboolean JNICALL Java_..._nativePlay(JNIEnv* env, jobject) {
//       return pristine::jni::guarded<jboolean>(env, "nativePlay", JNI_FALSE,
//           [&]() -> jboolean {
//           ... body lama, tidak berubah ...
//           });
//   }
//
//   JNIEXPORT void JNICALL Java_..._nativePause(JNIEnv* env, jobject) {
//       pristine::jni::guardedVoid(env, "nativePause", [&] {
//           ... body lama, tidak berubah ...
//       });
//   }
//
// Saat exception tertangkap: di-log ke tag "PristineJNI" (sama dengan
// OnLoad.cpp) dengan what(), lalu — bila belum ada exception Java pending
// (mis. OOM dari NewStringUTF di dalam body, yang harus dibiarkan naik
// apa adanya) — dilempar java/lang/RuntimeException via ThrowNew, dan
// fallback dikembalikan. Guard itu sendiri noexcept dan tidak mengalokasi
// di jalur error (pesan dirakit di buffer stack) supaya tidak bisa melempar
// lagi dari dalam handler.

#include <jni.h>

#include <android/log.h>
#include <cstdio>
#include <exception>
#include <utility>

namespace pristine::jni {

namespace detail {

// noexcept: hanya memanggil fungsi JNI (C, tidak melempar) + snprintf.
// Bila env null atau sudah ada exception pending, tidak melakukan apa-apa:
// exception yang sudah pending dibiarkan naik apa adanya.
inline void logAndThrow(JNIEnv* env, const char* where, const char* what) noexcept {
    __android_log_print(ANDROID_LOG_ERROR, "PristineJNI",
                        "%s: exception C++ tertangkap di batas JNI: %s",
                        where, what);
    if (!env) return;
    if (env->ExceptionCheck()) return;
    jclass exClass = env->FindClass("java/lang/RuntimeException");
    if (!exClass) {
        // FindClass gagal = exception pending (mis. NoClassDefFoundError);
        // biarkan itu yang naik, jangan ditimpa.
        return;
    }
    char msg[256];
    std::snprintf(msg, sizeof(msg), "PristineJNI %s: %s", where, what);
    env->ThrowNew(exClass, msg);
    env->DeleteLocalRef(exClass);
}

} // namespace detail

// Fungsi JNI yang mengembalikan nilai: tangkap std::exception dan catch(...),
// log + ThrowNew RuntimeException (bila belum ada exception pending), lalu
// kembalikan fallback.
template <typename R, typename F>
R guarded(JNIEnv* env, const char* where, R fallback, F&& fn) noexcept {
    try {
        return fn();
    } catch (const std::exception& e) {
        detail::logAndThrow(env, where, e.what());
    } catch (...) {
        detail::logAndThrow(env, where, "unknown exception (bukan std::exception)");
    }
    return fallback;
}

// Fungsi JNI void: sama seperti guarded, tanpa nilai kembali.
template <typename F>
void guardedVoid(JNIEnv* env, const char* where, F&& fn) noexcept {
    try {
        fn();
    } catch (const std::exception& e) {
        detail::logAndThrow(env, where, e.what());
    } catch (...) {
        detail::logAndThrow(env, where, "unknown exception (bukan std::exception)");
    }
}

} // namespace pristine::jni
