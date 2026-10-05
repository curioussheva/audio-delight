#include "DeviceRateDetector.h"

#include <jni.h>
#include <android/log.h>
#include <algorithm>
#include <atomic>
#include <mutex>
#include <string>

#undef LOG_TAG
#define LOG_TAG "DeviceRateDetector"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO,  LOG_TAG, __VA_ARGS__)
#define LOGW(...) __android_log_print(ANDROID_LOG_WARN,  LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

namespace pristine::audio {

namespace {

std::mutex gMutex;
std::vector<int32_t> gRates;
std::string gDeviceName;
bool gIsUsb = false;

// Terima JavaVM dari luar (dipanggil dari ContentUriResolver::init atau
// JNI_OnLoad). Reuse pointer yang sama supaya tidak ada dua sumber.
JavaVM* gVm = nullptr;

struct ScopedEnv {
    JNIEnv* env = nullptr;
    bool attached = false;

    ScopedEnv() {
        if (!gVm) return;
        void* e = nullptr;
        const jint rc = gVm->GetEnv(&e, JNI_VERSION_1_6);
        if (rc == JNI_OK) {
            env = static_cast<JNIEnv*>(e);
            return;
        }
        if (rc == JNI_EDETACHED && gVm->AttachCurrentThread(&env, nullptr) == JNI_OK) {
            attached = true;
        }
    }
    ~ScopedEnv() {
        if (attached && gVm) gVm->DetachCurrentThread();
    }
    bool ok() const { return env != nullptr; }
};

std::string describeException(JNIEnv* env) {
    if (!env->ExceptionCheck()) return {};
    jthrowable t = env->ExceptionOccurred();
    env->ExceptionClear();
    std::string out = "unknown";
    if (t) {
        jclass c = env->GetObjectClass(t);
        jmethodID ts = c ? env->GetMethodID(c, "toString", "()Ljava/lang/String;") : nullptr;
        if (ts) {
            auto js = (jstring)env->CallObjectMethod(t, ts);
            if (!env->ExceptionCheck() && js) {
                const char* s = env->GetStringUTFChars(js, nullptr);
                if (s) { out = s; env->ReleaseStringUTFChars(js, s); }
            }
            env->ExceptionClear();
        }
        env->DeleteLocalRef(t);
    }
    return out;
}

std::string jstr(JNIEnv* env, jstring s) {
    if (!s) return {};
    const char* c = env->GetStringUTFChars(s, nullptr);
    std::string out = c ? c : "";
    if (c) env->ReleaseStringUTFChars(s, c);
    return out;
}

} // namespace

// Dipanggil sekali dari JNI_OnLoad supaya detector bisa memakai JNI.
void setDeviceRateDetectorVm(JavaVM* vm) {
    gVm = vm;
}

int DeviceRateDetector::refresh() {
    std::lock_guard<std::mutex> lock(gMutex);
    gRates.clear();
    gDeviceName.clear();
    gIsUsb = false;

    if (!gVm) {
        LOGW("refresh: JavaVM belum di-set, tidak bisa deteksi laju");
        return 0;
    }

    ScopedEnv scope;
    if (!scope.ok()) {
        LOGE("refresh: JNIEnv tidak tersedia");
        return 0;
    }
    JNIEnv* env = scope.env;
    env->PushLocalFrame(64);

    // ---- Application context -------------------------------------------
    jclass at = env->FindClass("android/app/ActivityThread");
    jmethodID curApp = at ? env->GetStaticMethodID(at, "currentApplication",
                          "()Landroid/app/Application;") : nullptr;
    jobject app = curApp ? env->CallStaticObjectMethod(at, curApp) : nullptr;
    if (describeException(env).size() || !app) {
        LOGE("refresh: application context tidak tersedia");
        env->PopLocalFrame(nullptr);
        return 0;
    }

    jclass ctx = env->FindClass("android/content/Context");
    jmethodID getSystemService = ctx
        ? env->GetMethodID(ctx, "getSystemService", "(Ljava/lang/String;)Ljava/lang/Object;")
        : nullptr;
    if (!getSystemService) {
        env->PopLocalFrame(nullptr);
        return 0;
    }

    jstring audioSvc = env->NewStringUTF("audio");
    jobject audioManager = env->CallObjectMethod(app, getSystemService, audioSvc);
    if (describeException(env).size() || !audioManager) {
        LOGE("refresh: AudioManager tidak tersedia");
        env->PopLocalFrame(nullptr);
        return 0;
    }

    jclass amCls = env->GetObjectClass(audioManager);

    // ---- API 23+: getDevices(GET_DEVICES_OUTPUTS) ----------------------
    // Ini memberi daftar perangkat output, termasuk DAC USB, lengkap dengan
    // sample rate yang didukung masing-masing.
    jmethodID getDevices = env->GetMethodID(amCls, "getDevices", "(I)[Landroid/media/AudioDeviceInfo;");
    if (!getDevices) {
        // API < 23. Tidak ada cara resmi; pemanggil pakai default 48000.
        LOGW("refresh: getDevices tidak ada (API < 23) - pakai default 48000");
        env->PopLocalFrame(nullptr);
        return 0;
    }

    constexpr jint GET_DEVICES_OUTPUTS = 2;
    auto devices = (jobjectArray)env->CallObjectMethod(audioManager, getDevices, GET_DEVICES_OUTPUTS);
    if (describeException(env).size() || !devices) {
        LOGE("refresh: getDevices mengembalikan null");
        env->PopLocalFrame(nullptr);
        return 0;
    }

    jclass diCls = env->FindClass("android/media/AudioDeviceInfo");
    jmethodID getRates = env->GetMethodID(diCls, "getSampleRates", "()[I");
    jmethodID getType  = env->GetMethodID(diCls, "getType", "()I");
    jmethodID getName  = env->GetMethodID(diCls, "getProductName", "()Ljava/lang/CharSequence;");

    const jsize n = env->GetArrayLength(devices);
    std::vector<int32_t> all;
    int32_t usbRatesSeen = 0;

    for (jsize i = 0; i < n; ++i) {
        jobject dev = env->GetObjectArrayElement(devices, i);
        if (!dev) continue;

        const jint type = getType ? env->CallIntMethod(dev, getType) : -1;
        describeException(env);

        // TYPE_USB_DEVICE=11, TYPE_USB_HEADSET=22
        const bool isUsbDev = (type == 11 || type == 22);

        auto rates = getRates ? (jintArray)env->CallIntMethod(dev, getRates) : nullptr;
        if (describeException(env).size()) rates = nullptr;

        if (rates) {
            const jsize rn = env->GetArrayLength(rates);
            if (rn > 0) {
                std::vector<jint> buf(static_cast<size_t>(rn));
                env->GetIntArrayRegion(rates, 0, rn, buf.data());

                for (jint r : buf) {
                    if (r >= 8000 && r <= 768000) {
                        all.push_back(static_cast<int32_t>(r));
                        if (isUsbDev) usbRatesSeen++;
                    }
                }

                if (isUsbDev) {
                    gIsUsb = true;
                    if (getName) {
                        auto nm = env->CallObjectMethod(dev, getName);
                        if (!describeException(env).size() && nm) {
                            auto js = (jstring)env->CallObjectMethod(
                                nm,
                                env->GetMethodID(env->GetObjectClass(nm), "toString",
                                                 "()Ljava/lang/String;"));
                            if (!env->ExceptionCheck() && js) gDeviceName = jstr(env, js);
                            env->ExceptionClear();
                        }
                    }
                }
            }
        }
        env->DeleteLocalRef(dev);
    }

    env->PopLocalFrame(nullptr);

    if (all.empty()) {
        LOGW("refresh: tidak ada laju terdeteksi dari %d device output", (int)n);
        return 0;
    }

    std::sort(all.begin(), all.end());
    all.erase(std::unique(all.begin(), all.end()), all.end());
    gRates = std::move(all);

    std::string list;
    char buf[32];
    for (size_t i = 0; i < gRates.size(); ++i) {
        std::snprintf(buf, sizeof(buf), "%s%d", i ? "," : "", gRates[i]);
        list += buf;
    }

    LOGI("refresh: %zu laju didukung [%s]%s%s",
         gRates.size(), list.c_str(),
         gIsUsb ? " (USB aktif)" : "",
         usbRatesSeen ? "" : "");
    if (!gDeviceName.empty()) {
        LOGI("refresh: perangkat output = %s", gDeviceName.c_str());
    }
    return static_cast<int>(gRates.size());
}

const std::vector<int32_t>& DeviceRateDetector::supportedRates() {
    return gRates;
}

const char* DeviceRateDetector::activeDeviceName() {
    return gDeviceName.c_str();
}

bool DeviceRateDetector::isUsbActive() {
    return gIsUsb;
}

bool DeviceRateDetector::supportsRate(int32_t rate) {
    return std::find(gRates.begin(), gRates.end(), rate) != gRates.end();
}

int32_t DeviceRateDetector::pickBestRate(int32_t fileRate) {
    if (fileRate <= 0) return 48000;

    // Belum pernah deteksi: kembalikan laju file apa adanya. Lebih baik
    // mencoba laju asli daripada langsung menurunkan ke 48 kHz.
    if (gRates.empty()) return fileRate;

    // 1. Persis didukung -> tanpa konversi sama sekali.
    if (supportsRate(fileRate)) return fileRate;

    // 2. Kelipatan bulat terkecil (upsample integer). Rate conversion
    //    fraksional (mis. 44.1k->48k) butuh interpolasi yang mengubah sampel;
    //    kelipatan bulat tidak.
    int32_t bestMultiple = 0;
    for (int32_t r : gRates) {
        if (r > fileRate && r % fileRate == 0) {
            if (bestMultiple == 0 || r < bestMultiple) bestMultiple = r;
        }
    }
    if (bestMultiple > 0) return bestMultiple;

    // 3. Laju tertinggi yang didukung yang TIDAK melebihi laju file (turun
    //    sesedikit mungkin, tetap dalam rentang yang didukung device).
    //
    //    PENTING: JANGAN mengembalikan laju file kalau device tidak
    //    mendukungnya - stream akan gagal dibuka. Turun ke laju tertinggi yang
    //    didukung selalu berhasil dan hanya kehilangan bandwidth, bukan
    //    gagal sama sekali.
    int32_t bestLower = 0;
    for (int32_t r : gRates) {
        if (r <= fileRate && r > bestLower) bestLower = r;
    }
    if (bestLower > 0) return bestLower;

    // 4. Semua laju device lebih tinggi dari laju file (jarang): pakai yang
    //    terendah supaya kenaikan sesedikit mungkin.
    return gRates.front();
}

bool DeviceRateDetector::isBitPerfectFor(int32_t fileRate) {
    if (fileRate <= 0) return false;
    if (gRates.empty()) return false;   // belum tahu: tidak boleh diklaim
    return supportsRate(fileRate);
}

} // namespace pristine::audio
