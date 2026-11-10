#include "NativeEventEmitter.h"
#include <android/log.h>
#include <mutex>

namespace pristine::playback {

// 🔥 FIX (2026-11-10, p-m20): ketiga global ini dibaca dari thread decoder /
// advance (emitTrackEnded) dan ditulis dari thread JNI (initJavaVm /
// initModuleRef) — tanpa sinkronisasi itu data race (baca pointer sementara
// thread lain menulisnya). Semua akses kini lewat g_emitterMutex; emit
// menyalin ke lokal di bawah lock lalu melepasnya SEBELUM memanggil Java
// (callback Java tidak boleh jalan sambil memegang lock — ia bisa masuk
// lagi ke native). Sisa catatan: initModuleRef yang berjalan BERSAMAAN
// dengan emit (hanya saat bridge di-reload — modul dibuat ulang) bisa
// menghapus global ref yang sedang dipakai salinan lokal; dalam praktik
// initModuleRef jalan sekali saat startup sebelum ada emit.
static JavaVM* g_jvm = nullptr;
static jobject g_moduleRef = nullptr;
static jmethodID g_methodId = nullptr;
static std::mutex g_emitterMutex;

PRISTINE_EXPORT void initJavaVm(JavaVM* vm) {
    std::lock_guard<std::mutex> lock(g_emitterMutex);
    g_jvm = vm;
}

PRISTINE_EXPORT void initModuleRef(JNIEnv* env, jobject instance) {
    if (!env || !instance) return;
    std::lock_guard<std::mutex> lock(g_emitterMutex);
    if (g_moduleRef) {
        env->DeleteGlobalRef(g_moduleRef);
    }
    g_moduleRef = env->NewGlobalRef(instance);

    // Cache method ID sekali: (Ljava/lang/String;)V
    jclass cls = env->GetObjectClass(g_moduleRef);
    if (cls) {
        g_methodId = env->GetMethodID(cls, "onNativeTrackEnded", "(Ljava/lang/String;)V");
        env->DeleteLocalRef(cls);
    }

    __android_log_print(ANDROID_LOG_INFO, "NativeEventEmitter",
                        "initModuleRef: ref=%p method=%p",
                        (void*)g_moduleRef, (void*)g_methodId);
}

PRISTINE_EXPORT void emitTrackEnded(const std::string& uri) {
    // Salin di bawah lock, pakai salinan di luar lock (lihat komentar di atas).
    JavaVM* jvm = nullptr;
    jobject moduleRef = nullptr;
    jmethodID methodId = nullptr;
    {
        std::lock_guard<std::mutex> lock(g_emitterMutex);
        jvm = g_jvm;
        moduleRef = g_moduleRef;
        methodId = g_methodId;
    }
    if (!jvm || !moduleRef || !methodId) return;

    JNIEnv* env = nullptr;
    bool attached = false;

    // Thread decoder biasanya belum attach ke JVM.
    if (jvm->GetEnv(reinterpret_cast<void**>(&env), JNI_VERSION_1_6) != JNI_OK) {
        if (jvm->AttachCurrentThread(&env, nullptr) != JNI_OK) {
            __android_log_print(ANDROID_LOG_WARN, "NativeEventEmitter",
                                "emitTrackEnded: AttachCurrentThread failed");
            return;
        }
        attached = true;
    }

    if (!env) return;

    jstring jUri = env->NewStringUTF(uri.c_str());
    if (!jUri) {
        // OOM — NewStringUTF sudah melempar OutOfMemoryError; bersihkan
        // supaya thread ini bisa dipakai JNI lagi, lalu keluar.
        if (env->ExceptionCheck()) {
            __android_log_print(ANDROID_LOG_ERROR, "NativeEventEmitter",
                                "emitTrackEnded: NewStringUTF gagal (OOM)");
            env->ExceptionDescribe();
            env->ExceptionClear();
        }
        if (attached) {
            jvm->DetachCurrentThread();
        }
        return;
    }
    env->CallVoidMethod(moduleRef, methodId, jUri);
    // 🔥 FIX (2026-11-10, p-m20): periksa exception SETELAH CallVoidMethod.
    // Sebelumnya exception Java (mis. onNativeTrackEnded melempar) dibiarkan
    // pending — pemanggilan JNI berikutnya di thread ini gagal/crash, dan
    // DetachCurrentThread dengan exception pending tidak terdefinisi dengan
    // baik. Describe (supaya jejaknya masuk logcat) lalu Clear.
    if (env->ExceptionCheck()) {
        __android_log_print(ANDROID_LOG_ERROR, "NativeEventEmitter",
                            "emitTrackEnded: exception dari onNativeTrackEnded "
                            "untuk uri=%s",
                            uri.c_str());
        env->ExceptionDescribe();
        env->ExceptionClear();
    }
    env->DeleteLocalRef(jUri);

    if (attached) {
        jvm->DetachCurrentThread();
    }
}

} // namespace pristine::playback
