#include "ContentUriResolver.h"

#include <android/log.h>
#include <cstdio>
#include <cstdint>
#include <vector>

#undef LOG_TAG
#define LOG_TAG "ContentUriResolver"

#define LOGI(...) __android_log_print(ANDROID_LOG_INFO,  LOG_TAG, __VA_ARGS__)
#define LOGW(...) __android_log_print(ANDROID_LOG_WARN,  LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

namespace pristine::decoder {

namespace {

JavaVM* g_vm = nullptr;

// ---------------------------------------------------------------
// RAII: attach thread ke JVM kalau belum, detach hanya kalau kita
// yang attach. Dekoder berjalan di thread AUDIO (prioritas -16) yang
// belum tentu ter-attach ke JVM.
// ---------------------------------------------------------------
class ScopedEnv {
public:
    ScopedEnv() {
        if (!g_vm) return;

        // GetEnv mengambil void**, AttachCurrentThread mengambil JNIEnv**.
        // Keduanya tidak sama tipe; memakai satu variabel void* untuk
        // keduanya adalah undefined behavior.
        void* envVoid = nullptr;
        jint rc = g_vm->GetEnv(&envVoid, JNI_VERSION_1_6);

        if (rc == JNI_OK) {
            env_ = static_cast<JNIEnv*>(envVoid);
            return;                       // sudah ter-attach, jangan detach
        }
        if (rc == JNI_EDETACHED) {
            if (g_vm->AttachCurrentThread(&env_, nullptr) == JNI_OK) {
                attached_ = true;         // kita attach -> kita detach
                return;
            }
            LOGE("ScopedEnv: AttachCurrentThread gagal");
            env_ = nullptr;
            return;
        }
        LOGE("ScopedEnv: GetEnv rc=%d", (int)rc);
    }

    ~ScopedEnv() {
        if (attached_ && g_vm) g_vm->DetachCurrentThread();
    }

    ScopedEnv(const ScopedEnv&) = delete;
    ScopedEnv& operator=(const ScopedEnv&) = delete;

    JNIEnv* get() const { return env_; }
    bool ok() const { return env_ != nullptr; }

private:
    JNIEnv* env_ = nullptr;
    bool attached_ = false;
};

// ---------------------------------------------------------------
// RAII: bersihkan local ref walau ada early-return.
// Loop salinan bisa membuat banyak ref; tanpa frame, tabel ref penuh.
// ---------------------------------------------------------------
class LocalFrame {
public:
    explicit LocalFrame(JNIEnv* env, jint cap = 24) : env_(env) {
        if (env_) env_->PushLocalFrame(cap);
    }
    ~LocalFrame() {
        if (env_) env_->PopLocalFrame(nullptr);
    }
    LocalFrame(const LocalFrame&) = delete;
    LocalFrame& operator=(const LocalFrame&) = delete;
private:
    JNIEnv* env_;
};

// String helper: jstring -> std::string, selalu release.
std::string toStd(JNIEnv* env, jstring s) {
    if (!s) return {};
    const char* c = env->GetStringUTFChars(s, nullptr);
    std::string out = c ? c : "";
    if (c) env->ReleaseStringUTFChars(s, c);
    return out;
}

// Sama persis dengan java.lang.String.hashCode(), supaya file cache dari
// resolusi sisi Kotlin bisa dipakai ulang di sini (tidak salin dua kali).
int32_t javaStringHashCode(const std::string& s) {
    int32_t h = 0;
    for (unsigned char c : s) {
        h = 31 * h + static_cast<int32_t>(static_cast<signed char>(c));
    }
    return h;
}

// throwable -> pesan, untuk diagnosa; selalu clear exception.
std::string describeAndClear(JNIEnv* env) {
    if (!env->ExceptionCheck()) return {};
    jthrowable t = env->ExceptionOccurred();
    env->ExceptionClear();

    std::string msg = "unknown";
    if (t) {
        jclass tc = env->GetObjectClass(t);
        jmethodID toString = env->GetMethodID(tc, "toString", "()Ljava/lang/String;");
        if (toString) {
            auto js = (jstring)env->CallObjectMethod(t, toString);
            if (!env->ExceptionCheck() && js) msg = toStd(env, js);
            env->ExceptionClear();
        }
        env->DeleteLocalRef(t);
    }
    return msg;
}

} // namespace

// =====================================================
// INIT
// =====================================================

PRISTINE_EXPORT void ContentUriResolver::init(JavaVM* vm) {
    g_vm = vm;
    if (vm) {
        LOGI("init: JavaVM tersimpan, resolver siap");
    } else {
        LOGE("init: JavaVM null - resolver TIDAK akan bekerja");
    }
}

PRISTINE_EXPORT bool ContentUriResolver::isReady() {
    return g_vm != nullptr;
}

// =====================================================
// RESOLVE
// =====================================================
//
// content:// -> salin ke cache, kembalikan jalur file.
// bukan content:// -> kembalikan apa adanya.
// gagal -> kembalikan "" (string kosong) supaya pemanggil tahu ini GAGAL.
//   Sengaja TIDAK mengembalikan uri asli: meneruskan content:// ke FFmpeg
//   selalu gagal, dan pemanggil jadi tidak bisa membedakan "berhasil lewat
//   jalur lain" dari "tidak perlu resolve".

PRISTINE_EXPORT std::string ContentUriResolver::resolve(const std::string& uri) {
    if (uri.rfind("content://", 0) != 0) {
        return uri;
    }

    if (!g_vm) {
        LOGE("resolve: JavaVM belum di-init, tidak bisa resolve %s", uri.c_str());
        return "";
    }

    ScopedEnv scope;
    if (!scope.ok()) {
        LOGE("resolve: JNIEnv tidak tersedia");
        return "";
    }
    JNIEnv* env = scope.get();
    LocalFrame frame(env, 48);

    // ---- Context / Application ------------------------------------------
    //
    // PENTING: FindClass dari thread yang di-attach lewat AttachCurrentThread
    // memakai class loader SISTEM, bukan class loader aplikasi. Kelas framework
    // (ActivityThread, Context, ContentResolver) ada di boot classpath jadi
    // tetap ketemu. Kalau nanti butuh kelas aplikasi sendiri, ambil class
    // loader lewat jobject context, bukan FindClass langsung.
    jclass activityThread = env->FindClass("android/app/ActivityThread");
    if (!activityThread) {
        LOGE("resolve: ActivityThread tidak ada: %s", describeAndClear(env).c_str());
        return "";
    }

    jmethodID currentApplication = env->GetStaticMethodID(
        activityThread, "currentApplication", "()Landroid/app/Application;");
    if (!currentApplication) { LOGE("resolve: currentApplication tidak ada"); return ""; }

    jobject app = env->CallStaticObjectMethod(activityThread, currentApplication);
    if (describeAndClear(env).size() || !app) {
        LOGE("resolve: currentApplication() null");
        return "";
    }

    jclass ctxClass = env->FindClass("android/content/Context");
    if (!ctxClass) { LOGE("resolve: Context tidak ada"); return ""; }

    jmethodID getCacheDir = env->GetMethodID(ctxClass, "getCacheDir", "()Ljava/io/File;");
    jmethodID getContentResolver = env->GetMethodID(ctxClass, "getContentResolver",
                                                    "()Landroid/content/ContentResolver;");
    if (!getCacheDir || !getContentResolver) { LOGE("resolve: method Context tidak ada"); return ""; }

    // ---- Uri.parse -------------------------------------------------------
    jclass uriClass = env->FindClass("android/net/Uri");
    if (!uriClass) { LOGE("resolve: Uri tidak ada"); return ""; }
    jmethodID uriParse = env->GetStaticMethodID(
        uriClass, "parse", "(Ljava/lang/String;)Landroid/net/Uri;");
    if (!uriParse) { LOGE("resolve: Uri.parse tidak ada"); return ""; }

    jstring juri = env->NewStringUTF(uri.c_str());
    if (!juri) { LOGE("resolve: gagal buat jstring"); return ""; }
    jobject parsedUri = env->CallStaticObjectMethod(uriClass, uriParse, juri);
    if (describeAndClear(env).size() || !parsedUri) {
        LOGE("resolve: Uri.parse null untuk %s", uri.c_str());
        return "";
    }

    // ---- ContentResolver -------------------------------------------------
    jobject cr = env->CallObjectMethod(app, getContentResolver);
    if (describeAndClear(env).size() || !cr) { LOGE("resolve: ContentResolver null"); return ""; }

    jclass resolverClass = env->FindClass("android/content/ContentResolver");
    if (!resolverClass) { LOGE("resolve: ContentResolver class tidak ada"); return ""; }

    jmethodID getType = env->GetMethodID(resolverClass, "getType",
                                         "(Landroid/net/Uri;)Ljava/lang/String;");
    jmethodID openInputStream = env->GetMethodID(
        resolverClass, "openInputStream",
        "(Landroid/net/Uri;)Ljava/io/InputStream;");
    if (!getType || !openInputStream) { LOGE("resolve: method resolver tidak ada"); return ""; }

    // ---- Nama file cache: "audio_<javaHashCode>.<ext>" ------------------
    std::string ext = "cache";
    {
        auto jtype = (jstring)env->CallObjectMethod(cr, getType, parsedUri);
        if (describeAndClear(env).empty() && jtype) {
            std::string type = toStd(env, jtype);
            auto slash = type.find_last_of('/');
            if (slash != std::string::npos && slash + 1 < type.size()) {
                ext = type.substr(slash + 1);
            }
        }
    }

    // ---- Cache dir -------------------------------------------------------
    jobject cacheDirObj = env->CallObjectMethod(app, getCacheDir);
    if (describeAndClear(env).size() || !cacheDirObj) { LOGE("resolve: cacheDir null"); return ""; }

    jclass fileClass = env->FindClass("java/io/File");
    jmethodID getAbsolutePath = fileClass
        ? env->GetMethodID(fileClass, "getAbsolutePath", "()Ljava/lang/String;")
        : nullptr;
    if (!getAbsolutePath) { LOGE("resolve: getAbsolutePath tidak ada"); return ""; }

    auto jcachePath = (jstring)env->CallObjectMethod(cacheDirObj, getAbsolutePath);
    if (describeAndClear(env).size() || !jcachePath) { LOGE("resolve: cachePath null"); return ""; }

    std::string cacheDir = toStd(env, jcachePath);
    if (cacheDir.empty()) { LOGE("resolve: cache dir kosong"); return ""; }

    char nameBuf[160];
    std::snprintf(nameBuf, sizeof(nameBuf), "audio_%d.%s",
                  javaStringHashCode(uri), ext.c_str());
    std::string target = cacheDir + "/" + nameBuf;

    // ---- Cache sudah ada? ------------------------------------------------
    // Cek lewat Java supaya semantiknya sama dengan sisi Kotlin
    // (exists() && length() > 0), bukan stat().
    jmethodID fileCtor = fileClass
        ? env->GetMethodID(fileClass, "<init>", "(Ljava/lang/String;)V")
        : nullptr;
    jmethodID exists = fileClass ? env->GetMethodID(fileClass, "exists", "()Z") : nullptr;
    jmethodID length = fileClass ? env->GetMethodID(fileClass, "length", "()J") : nullptr;
    if (!fileCtor || !exists || !length) { LOGE("resolve: method File tidak ada"); return ""; }

    jstring jtarget = env->NewStringUTF(target.c_str());
    jobject targetFile = env->NewObject(fileClass, fileCtor, jtarget);
    if (describeAndClear(env).empty() && targetFile) {
        jboolean ex = env->CallBooleanMethod(targetFile, exists);
        jlong len = env->CallLongMethod(targetFile, length);
        if (describeAndClear(env).empty() && ex == JNI_TRUE && len > 0) {
            LOGI("resolve: cache hit %s (%lld bytes)", nameBuf, (long long)len);
            return target;
        }
    }

    // ---- Salin isi -------------------------------------------------------
    jobject input = env->CallObjectMethod(cr, openInputStream, parsedUri);
    std::string err = describeAndClear(env);
    if (!err.empty()) {
        LOGE("resolve: openInputStream melempar %s untuk %s", err.c_str(), uri.c_str());
        return "";
    }
    if (!input) {
        LOGE("resolve: openInputStream null untuk %s", uri.c_str());
        return "";
    }

    jclass isClass = env->FindClass("java/io/InputStream");
    jmethodID readMethod = isClass ? env->GetMethodID(isClass, "read", "([B)I") : nullptr;
    jmethodID closeMethod = isClass ? env->GetMethodID(isClass, "close", "()V") : nullptr;
    if (!readMethod || !closeMethod) { LOGE("resolve: method InputStream tidak ada"); return ""; }

    constexpr jsize CHUNK = 256 * 1024;
    jbyteArray buf = env->NewByteArray(CHUNK);
    if (!buf) { LOGE("resolve: gagal alokasi buffer"); return ""; }

    // Dibaca penuh ke memori dulu, baru ditulis: file cache tidak pernah
    // setengah jadi kalau proses mati di tengah salinan.
    std::vector<uint8_t> data;
    data.reserve(8u * 1024u * 1024u);

    for (;;) {
        jint n = env->CallIntMethod(input, readMethod, buf);
        std::string rerr = describeAndClear(env);
        if (!rerr.empty()) {
            env->CallVoidMethod(input, closeMethod);
            describeAndClear(env);
            LOGE("resolve: read melempar %s untuk %s", rerr.c_str(), uri.c_str());
            return "";
        }
        if (n <= 0) break;

        size_t old = data.size();
        data.resize(old + static_cast<size_t>(n));
        env->GetByteArrayRegion(buf, 0, n,
                                reinterpret_cast<jbyte*>(data.data() + old));
    }

    env->CallVoidMethod(input, closeMethod);
    describeAndClear(env);

    if (data.empty()) {
        LOGE("resolve: sumber kosong (0 byte) untuk %s", uri.c_str());
        return "";
    }

    if (FILE* fp = std::fopen(target.c_str(), "wb")) {
        size_t written = std::fwrite(data.data(), 1, data.size(), fp);
        std::fclose(fp);
        if (written != data.size()) {
            LOGE("resolve: tulis tidak lengkap (%zu/%zu)", written, data.size());
            std::remove(target.c_str());
            return "";
        }
    } else {
        LOGE("resolve: tidak bisa menulis %s", target.c_str());
        return "";
    }

    LOGI("resolve: cached %s (%zu bytes)", nameBuf, data.size());
    return target;
}

} // namespace pristine::decoder
