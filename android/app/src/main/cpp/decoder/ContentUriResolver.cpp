#include "ContentUriResolver.h"
#include "core/JniContext.h"

#include <android/log.h>
#include <atomic>
#include <cstdio>
#include <cstdint>
#include <string>
#include <sys/stat.h>
#include <unistd.h>
#include <vector>

#undef LOG_TAG
#define LOG_TAG "ContentUriResolver"

#define LOGI(...) __android_log_print(ANDROID_LOG_INFO,  LOG_TAG, __VA_ARGS__)
#define LOGW(...) __android_log_print(ANDROID_LOG_WARN,  LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

namespace pristine::decoder {

namespace {

// (C-HIDDEN, 2026-11-12): JavaVM + application Context dan ScopedEnv kini
// tinggal satu di core/JniContext.h — g_vm dan class ScopedEnv lokal di sini
// dihapus (yang tersisa di AudioDeviceManager.cpp juga dihapus di commit
// yang sama; DeviceRateDetector yang ketiga sudah dihapus item 8).

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

// FNV-1a 64-bit atas byte UTF-8 URI (B9-cache64, 2026-11-12) — pengganti
// java.lang.String.hashCode() 32-bit. Nama cache harus IDENTIK dengan sisi
// Kotlin (NativePlaybackService.kt, NativePlaybackModule.kt) dan sisi TS
// (cacheNaming.ts) supaya file cache dari satu jalur bisa dipakai ulang
// jalur lain (tidak salin dua kali). Offset basis 14695981039346656037,
// prima 1099511628211, per byte: h ^= byte; h *= prima (wrap mod 2^64).
// Format nama: "audio_<16 digit hex lowercase, zero-padded>.<ext>".
// Catatan byte: string di sini datang dari GetStringUTFChars (modified
// UTF-8); untuk URI (ASCII, tanpa NUL / karakter supplementary) identik
// dengan UTF-8 standar yang dipakai Kotlin/TS.
uint64_t fnv1a64(const std::string& s) {
    uint64_t h = 14695981039346656037ull;
    for (unsigned char c : s) {
        h ^= static_cast<uint64_t>(c);
        h *= 1099511628211ull;
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
    // (C-HIDDEN, 2026-11-12): kini hanya meneruskan ke holder bersama di
    // core/JniContext.h — pointer JavaVM-nya memang SATU dan sama untuk
    // semua pemakai, dan itu benar.
    jni::setJavaVm(vm);
    if (vm) {
        LOGI("init: JavaVM tersimpan, resolver siap");
    } else {
        LOGE("init: JavaVM null - resolver TIDAK akan bekerja");
    }
}

PRISTINE_EXPORT bool ContentUriResolver::isReady() {
    return jni::javaVm() != nullptr;
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

    if (!jni::javaVm()) {
        LOGE("resolve: JavaVM belum di-init, tidak bisa resolve %s", uri.c_str());
        return "";
    }

    jni::ScopedEnv scope;
    if (!scope.ok()) {
        LOGE("resolve: JNIEnv tidak tersedia");
        return "";
    }
    JNIEnv* env = scope.get();
    LocalFrame frame(env, 48);

    // ---- Context / Application ------------------------------------------
    //
    // (C-HIDDEN, 2026-11-12): global ref dari Kotlin (nativeInitAppContext),
    // BUKAN lagi ActivityThread.currentApplication() (@hide / non-SDK).
    // Kalau init Kotlin belum jalan, gagal aman (return "") — JANGAN crash;
    // pemanggil memperlakukan "" sebagai kegagalan resolve.
    //
    // PENTING: FindClass dari thread yang di-attach lewat AttachCurrentThread
    // memakai class loader SISTEM, bukan class loader aplikasi. Kelas framework
    // (Uri, ContentResolver, File, InputStream) ada di boot classpath jadi
    // tetap ketemu. Kelas Context sendiri tidak lagi dicari lewat FindClass —
    // diambil dari objeknya lewat GetObjectClass. Kalau nanti butuh kelas
    // aplikasi sendiri, ambil class loader lewat jobject context, bukan
    // FindClass langsung.
    jobject app = jni::appContext();
    if (!app) {
        LOGE("resolve: application context belum di-init "
             "(nativeInitAppContext belum dipanggil)");
        return "";
    }

    jclass ctxClass = env->GetObjectClass(app);
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

    // ---- Nama file cache: "audio_<fnv1a64 hex 16 digit>.<ext>" ---------
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
    std::snprintf(nameBuf, sizeof(nameBuf), "audio_%016llx.%s",
                  static_cast<unsigned long long>(fnv1a64(uri)), ext.c_str());
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
    if (!readMethod || !closeMethod) {
        if (closeMethod) {
            env->CallVoidMethod(input, closeMethod);
            describeAndClear(env);
        }
        LOGE("resolve: method InputStream tidak ada");
        return "";
    }

    constexpr jsize CHUNK = 256 * 1024;
    jbyteArray buf = env->NewByteArray(CHUNK);
    if (!buf) {
        env->CallVoidMethod(input, closeMethod);
        describeAndClear(env);
        LOGE("resolve: gagal alokasi buffer");
        return "";
    }

    // Ditulis per-chunk langsung ke file temp + rename atomik (D-M9,
    // 2026-11-11; B9-R1, 2026-11-12: streaming, tanpa buffer penuh).
    // File cache di path target tidak pernah setengah jadi: rename()
    // dalam satu filesystem bersifat atomik, target hanya muncul kalau
    // isinya sudah lengkap. Nama temp unik per panggilan (counter atomik)
    // supaya dua resolve bersamaan untuk URI yang sama tidak menulis ke
    // file temp yang sama (d-m35). Sisa file .tmp dari proses yang mati
    // dibersihkan cold boot (clearCache) — dan tidak pernah dilayani
    // sebagai hit karena namanya tidak cocok pola audio_*.
    // RAM puncak ~512 KB (buffer JNI 256 KB + buffer salin 256 KB),
    // bukan ~2x ukuran file seperti baca-penuh-ke-memori sebelumnya.
    static std::atomic<unsigned> s_tmpCounter{0};
    const std::string tmpTarget =
        target + ".tmp." +
        std::to_string(s_tmpCounter.fetch_add(1, std::memory_order_relaxed));
    FILE* fp = std::fopen(tmpTarget.c_str(), "wb");
    if (!fp) {
        env->CallVoidMethod(input, closeMethod);
        describeAndClear(env);
        LOGE("resolve: tidak bisa menulis %s", tmpTarget.c_str());
        return "";
    }

    // Buffer salin heap 256 KB (bukan stack: thread worker bisa ber-stack
    // kecil); GetByteArrayRegion pindah dari buffer JNI ke sini per chunk.
    std::vector<uint8_t> chunk(static_cast<size_t>(CHUNK));
    size_t total = 0;
    bool failed = false;
    for (;;) {
        jint n = env->CallIntMethod(input, readMethod, buf);
        std::string rerr = describeAndClear(env);
        if (!rerr.empty()) {
            LOGE("resolve: read melempar %s untuk %s", rerr.c_str(), uri.c_str());
            failed = true;
            break;
        }
        if (n <= 0) break;

        env->GetByteArrayRegion(buf, 0, n,
                                reinterpret_cast<jbyte*>(chunk.data()));
        if (std::fwrite(chunk.data(), 1, static_cast<size_t>(n), fp) !=
            static_cast<size_t>(n)) {
            LOGE("resolve: tulis gagal di byte %zu untuk %s", total, uri.c_str());
            failed = true;
            break;
        }
        total += static_cast<size_t>(n);
    }

    // InputStream ditutup di semua jalur (sukses dan gagal); fclose
    // mem-flush buffer stdio — gagal di sini = disk penuh / I/O error,
    // jadi harus dicek, bukan diabaikan.
    env->CallVoidMethod(input, closeMethod);
    describeAndClear(env);
    bool closeOk = std::fclose(fp) == 0;

    if (failed || !closeOk) {
        std::remove(tmpTarget.c_str());
        return "";
    }
    if (total == 0) {
        LOGE("resolve: sumber kosong (0 byte) untuk %s", uri.c_str());
        std::remove(tmpTarget.c_str());
        return "";
    }

    if (std::rename(tmpTarget.c_str(), target.c_str()) != 0) {
        LOGE("resolve: rename %s -> %s gagal", tmpTarget.c_str(), target.c_str());
        std::remove(tmpTarget.c_str());
        return "";
    }

    LOGI("resolve: cached %s (%zu bytes)", nameBuf, total);
    return target;
}

// =====================================================
// OPEN FD (B9-fd-AVIO)
// =====================================================
//
// content:// -> fd mentah via openFileDescriptor + detachFd, NOL salinan.
// Bukan content:// -> -1 (pemanggil memakai resolve() biasa).
// Gagal -> -1 (pemanggil fallback ke resolve() atau gagal — lihat header).
//
// Prolog JNI (ScopedEnv, appContext, Uri.parse, getContentResolver)
// sengaja diduplikasi dari resolve(), bukan diekstrak ke helper bersama:
// resolve() adalah jalur yang sudah terbukti (B9-R1) dan tidak boleh
// berubah perilakunya karena refactor helper di item ini.

PRISTINE_EXPORT int ContentUriResolver::openFd(const std::string& uri) {
    if (uri.rfind("content://", 0) != 0) {
        return -1;
    }

    if (!jni::javaVm()) {
        LOGE("openFd: JavaVM belum di-init, tidak bisa buka %s", uri.c_str());
        return -1;
    }

    jni::ScopedEnv scope;
    if (!scope.ok()) {
        LOGE("openFd: JNIEnv tidak tersedia");
        return -1;
    }
    JNIEnv* env = scope.get();
    LocalFrame frame(env, 48);

    jobject app = jni::appContext();
    if (!app) {
        LOGE("openFd: application context belum di-init "
             "(nativeInitAppContext belum dipanggil)");
        return -1;
    }

    jclass ctxClass = env->GetObjectClass(app);
    if (!ctxClass) { LOGE("openFd: Context tidak ada"); return -1; }

    jmethodID getContentResolver = env->GetMethodID(ctxClass, "getContentResolver",
                                                    "()Landroid/content/ContentResolver;");
    if (!getContentResolver) { LOGE("openFd: getContentResolver tidak ada"); return -1; }

    jclass uriClass = env->FindClass("android/net/Uri");
    if (!uriClass) { LOGE("openFd: Uri tidak ada"); return -1; }
    jmethodID uriParse = env->GetStaticMethodID(
        uriClass, "parse", "(Ljava/lang/String;)Landroid/net/Uri;");
    if (!uriParse) { LOGE("openFd: Uri.parse tidak ada"); return -1; }

    jstring juri = env->NewStringUTF(uri.c_str());
    if (!juri) { LOGE("openFd: gagal buat jstring"); return -1; }
    jobject parsedUri = env->CallStaticObjectMethod(uriClass, uriParse, juri);
    if (describeAndClear(env).size() || !parsedUri) {
        LOGE("openFd: Uri.parse null untuk %s", uri.c_str());
        return -1;
    }

    jobject cr = env->CallObjectMethod(app, getContentResolver);
    if (describeAndClear(env).size() || !cr) { LOGE("openFd: ContentResolver null"); return -1; }

    jclass resolverClass = env->FindClass("android/content/ContentResolver");
    if (!resolverClass) { LOGE("openFd: ContentResolver class tidak ada"); return -1; }

    // ContentResolver.openFileDescriptor(Uri, String) — API publik sejak
    // API 1; mode "r" = baca saja. (Terverifikasi dari Android Developers
    // reference; repo ini belum pernah memakai method ini sebelumnya —
    // satu-satunya jejak detachFd() adalah komentar di
    // NativePlaybackModule.kt:276.)
    jmethodID openFdMethod = env->GetMethodID(
        resolverClass, "openFileDescriptor",
        "(Landroid/net/Uri;Ljava/lang/String;)Landroid/os/ParcelFileDescriptor;");
    if (!openFdMethod) { LOGE("openFd: openFileDescriptor tidak ada"); return -1; }

    jstring jmode = env->NewStringUTF("r");
    if (!jmode) { LOGE("openFd: gagal buat jstring mode"); return -1; }
    jobject pfd = env->CallObjectMethod(cr, openFdMethod, parsedUri, jmode);
    std::string err = describeAndClear(env);
    if (!err.empty()) {
        // Termasuk FileNotFoundException bila provider mengembalikan
        // sub-section (openFileDescriptor tidak mendukung itu) — jalur
        // salin (resolve) yang menanganinya lewat openInputStream.
        LOGE("openFd: openFileDescriptor melempar %s untuk %s", err.c_str(), uri.c_str());
        return -1;
    }
    if (!pfd) {
        LOGE("openFd: openFileDescriptor null untuk %s", uri.c_str());
        return -1;
    }

    // ParcelFileDescriptor.detachFd() -> int. Sesudah detach, objek Java
    // tidak lagi memiliki fd — GC boleh membebaskan objeknya tanpa
    // menutup fd kita. fd sepenuhnya milik native mulai titik ini.
    jclass pfdClass = env->FindClass("android/os/ParcelFileDescriptor");
    if (!pfdClass) { LOGE("openFd: ParcelFileDescriptor tidak ada"); return -1; }
    jmethodID detachFd = env->GetMethodID(pfdClass, "detachFd", "()I");
    if (!detachFd) { LOGE("openFd: detachFd tidak ada"); return -1; }

    jint fd = env->CallIntMethod(pfd, detachFd);
    err = describeAndClear(env);
    if (!err.empty() || fd < 0) {
        LOGE("openFd: detachFd gagal (%s) untuk %s", err.c_str(), uri.c_str());
        return -1;
    }

    // pread/lseek di AVIO butuh file reguler: sebagian provider
    // mengembalikan pipe yang tidak bisa di-seek, dan ukurannya tidak
    // diketahui (fstat -> 0). Tolak di sini — tutup fd, kembalikan -1
    // supaya pemanggil fallback ke jalur salin; JANGAN serahkan fd
    // non-reguler ke FFmpeg.
    struct stat st;
    if (::fstat(fd, &st) != 0 || !S_ISREG(st.st_mode)) {
        LOGW("openFd: fd %d bukan file reguler untuk %s — fallback ke salin cache",
             (int)fd, uri.c_str());
        ::close(fd);
        return -1;
    }

    LOGI("openFd: %s -> fd %d (%lld bytes)", uri.c_str(), (int)fd,
         (long long)st.st_size);
    return static_cast<int>(fd);
}

} // namespace pristine::decoder
