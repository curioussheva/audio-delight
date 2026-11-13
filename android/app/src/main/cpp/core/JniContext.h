#pragma once

// core/JniContext.h
//
// Satu-satunya penyimpan JavaVM + application Context untuk lapisan native.
//
// (C-HIDDEN, 2026-11-12): sebelumnya DUA pemakai (AudioDeviceManager dan
// ContentUriResolver) masing-masing memanggil hidden API
// ActivityThread.currentApplication() untuk mendapatkan Context — @hide /
// non-SDK, dan rawan diblokir di Android mendatang (keanggotaan daftar
// persisnya belum terbukti, tapi kehati-hatian beralasan). Sekarang Context
// datang SEKALI dari Kotlin (NativeDeviceModule.initialize() ->
// nativeInitAppContext(applicationContext)) dan disimpan sebagai global ref
// di sini. JNI_OnLoad tetap hanya menyimpan JavaVM — ia hanya menerima
// JavaVM, jadi tidak ada Context di sana; global ref HARUS datang dari
// panggilan init Kotlin.
//
// Struct ScopedEnv yang dulu ADA DUA (satu per file, di anonymous namespace
// masing-masing — DeviceRateDetector yang ketiga sudah dihapus item 8) kini
// juga tinggal satu di sini. Pointer JavaVM-nya memang SATU dan sama untuk
// semua pemakai — itu benar, bukan bug, dan tidak diubah: setter lama
// (ContentUriResolver::init, setAudioDeviceManagerVm) tetap ada sebagai
// titik masuk dan kini meneruskan ke holder ini; NativeEventEmitter
// menyimpan salinan JavaVM-nya sendiri (punya mutex sendiri, tidak butuh
// Context) dan sengaja tidak disentuh.
//
// Thread-safety: setter/getter dikunci mutex; pembaca menyalin pointer di
// bawah lock lalu memakai salinannya di luar lock (pola yang sama dengan
// NativeEventEmitter). Pengecualian: setAppContext memakai std::call_once
// (B11-P2-4) supaya panggilan JNI tidak berjalan sambil memegang mutex.
// Global ref Context tidak pernah dihapus selama proses hidup — Application
// hidup selama proses, jadi tidak ada use-after-free.
//
// Header-only (inline, C++17): tidak perlu entri CMake baru.

#include <jni.h>
#include <android/log.h>
#include <mutex>

namespace pristine::jni {

namespace detail {

struct JniHolder {
    std::mutex mutex;
    JavaVM* vm = nullptr;
    jobject appContext = nullptr;  // global ref ke Application, atau nullptr
    // (B11-P2-4): sekali-init untuk appContext — lihat setAppContext.
    std::once_flag appContextOnce;
};

inline JniHolder& holder() {
    static JniHolder h;
    return h;
}

}  // namespace detail

// Simpan JavaVM (dari JNI_OnLoad lewat setter masing-masing modul).
// Idempotent: nilai yang disimpan selalu pointer yang sama.
inline void setJavaVm(JavaVM* vm) {
    if (!vm) return;
    auto& h = detail::holder();
    std::lock_guard<std::mutex> lock(h.mutex);
    h.vm = vm;
}

inline JavaVM* javaVm() {
    auto& h = detail::holder();
    std::lock_guard<std::mutex> lock(h.mutex);
    return h.vm;
}

// Simpan application Context sebagai global ref. Dipanggil sekali dari
// Kotlin (nativeInitAppContext). First-wins: panggilan berikutnya diabaikan
// — Context aplikasi sama selama proses hidup.
//
// (B11-P2-4): init sekali via std::call_once, bukan di bawah h.mutex —
// panggilan JNI di bawah (GetObjectClass/GetMethodID/CallObjectMethod/
// NewGlobalRef) tidak lagi berjalan sambil memegang mutex. Single-init
// terbukti, bukan asumsi: satu-satunya call site adalah
// nativeInitAppContext (NativeDeviceModule.cpp), yang dipanggil sekali dari
// NativeDeviceModule.initialize() dengan applicationContext yang sama
// selama proses hidup. Catatan: bila init pertama gagal (mis. NewGlobalRef
// OOM), call_once tidak mengulang — appContext tetap null dan pemakainya
// gagal aman (return 0 / "") seperti sebelumnya.
inline bool setAppContext(JNIEnv* env, jobject context) {
    if (!env || !context) return false;
    auto& h = detail::holder();
    std::call_once(h.appContextOnce, [&]() {
        // Ambil applicationContext() dari apa pun yang diteruskan, supaya
        // pemanggil yang tidak sengaja meneruskan Activity tetap aman.
        // (Kalau yang diteruskan sudah Application, ini mengembalikan
        // dirinya.)
        jobject app = nullptr;
        jclass cls = env->GetObjectClass(context);
        if (cls) {
            jmethodID getAppCtx = env->GetMethodID(
                cls, "getApplicationContext", "()Landroid/content/Context;");
            if (getAppCtx) {
                app = env->CallObjectMethod(context, getAppCtx);
                if (env->ExceptionCheck()) {
                    env->ExceptionClear();
                    app = nullptr;
                }
            } else {
                env->ExceptionClear();
            }
            env->DeleteLocalRef(cls);
        }
        if (!app) app = context;
        h.appContext = env->NewGlobalRef(app);
        if (app != context) env->DeleteLocalRef(app);
        if (!h.appContext) {
            __android_log_print(ANDROID_LOG_ERROR, "JniContext",
                                "setAppContext: NewGlobalRef gagal (OOM?)");
            return;
        }
        __android_log_print(ANDROID_LOG_INFO, "JniContext",
                            "setAppContext: application context tersimpan %p",
                            (void*)h.appContext);
    });
    // call_once sudah selesai di titik ini, jadi baca hasil di bawah lock.
    std::lock_guard<std::mutex> lock(h.mutex);
    return h.appContext != nullptr;
}

// Global ref ke Application, atau nullptr kalau nativeInitAppContext belum
// dipanggil. JANGAN DeleteLocalRef/DeleteGlobalRef hasil ini.
inline jobject appContext() {
    auto& h = detail::holder();
    std::lock_guard<std::mutex> lock(h.mutex);
    return h.appContext;
}

// ---------------------------------------------------------------
// RAII: attach thread ke JVM kalau belum, detach hanya kalau kita
// yang attach. Dipakai dari thread mana pun (JS, audio, dekoder).
// ---------------------------------------------------------------
class ScopedEnv {
public:
    ScopedEnv() {
        JavaVM* vm = javaVm();
        if (!vm) return;

        // GetEnv mengambil void**, AttachCurrentThread mengambil JNIEnv**.
        // Keduanya tidak sama tipe; memakai satu variabel void* untuk
        // keduanya adalah undefined behavior.
        void* envVoid = nullptr;
        jint rc = vm->GetEnv(&envVoid, JNI_VERSION_1_6);

        if (rc == JNI_OK) {
            env_ = static_cast<JNIEnv*>(envVoid);
            return;                       // sudah ter-attach, jangan detach
        }
        if (rc == JNI_EDETACHED) {
            if (vm->AttachCurrentThread(&env_, nullptr) == JNI_OK) {
                attached_ = true;         // kita attach -> kita detach
                vm_ = vm;
                return;
            }
            __android_log_print(ANDROID_LOG_ERROR, "JniContext",
                                "ScopedEnv: AttachCurrentThread gagal");
            env_ = nullptr;
            return;
        }
        __android_log_print(ANDROID_LOG_ERROR, "JniContext",
                            "ScopedEnv: GetEnv rc=%d", (int)rc);
    }

    ~ScopedEnv() {
        if (attached_ && vm_) vm_->DetachCurrentThread();
    }

    ScopedEnv(const ScopedEnv&) = delete;
    ScopedEnv& operator=(const ScopedEnv&) = delete;

    JNIEnv* get() const { return env_; }
    bool ok() const { return env_ != nullptr; }

private:
    JavaVM* vm_ = nullptr;
    JNIEnv* env_ = nullptr;
    bool attached_ = false;
};

}  // namespace pristine::jni
