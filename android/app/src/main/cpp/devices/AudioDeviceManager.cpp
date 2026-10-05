#include "AudioDeviceManager.h"

#include <jni.h>
#include <android/log.h>
#include <algorithm>

#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, "AudioDeviceManager", __VA_ARGS__)
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO,  "AudioDeviceManager", __VA_ARGS__)
#define LOGW(...) __android_log_print(ANDROID_LOG_WARN,  "AudioDeviceManager", __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, "AudioDeviceManager", __VA_ARGS__)

namespace pristine {

namespace {

JavaVM* gVm = nullptr;

// Attach/detach thread sesuai kebutuhan, sama seperti ContentUriResolver.
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

std::string describeAndClear(JNIEnv* env) {
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

// Pemetaan AudioDeviceInfo.getType() -> DeviceType.
//
// Nilai dari android.media.AudioDeviceInfo:
//   1 BUILTIN_EARPIECE, 2 BUILTIN_SPEAKER, 3 WIRED_HEADSET, 4 WIRED_HEADPHONES,
//   5 BLUETOOTH_SCO, 6 BLUETOOTH_A2DP, 7 HDMI, 8 HDMI_ARC, 9 HDMI_EARC,
//   11 USB_DEVICE, 12 USB_ACCESSORY, 13 DOCK, 22 USB_HEADSET
DeviceType mapDeviceType(jint androidType, bool& outIsUsb) {
    outIsUsb = false;
    switch (androidType) {
        case 1:  return DeviceType::BUILTIN_EARPIECE;
        case 2:  return DeviceType::BUILTIN_SPEAKER;
        case 3:
        case 4:  return DeviceType::WIRED_HEADSET;
        case 5:
        case 6:  return DeviceType::BLUETOOTH;
        case 7:
        case 8:
        case 9:  return DeviceType::HDMI;
        case 11:
        case 12:
        case 22: outIsUsb = true; return DeviceType::USB_AUDIO;
        case 13: return DeviceType::UNKNOWN;      // DOCK: tidak selalu audio
        default: return DeviceType::UNKNOWN;
    }
}

} // namespace

// Dipanggil sekali dari JNI_OnLoad supaya manager bisa memakai JNI.
void setAudioDeviceManagerVm(JavaVM* vm) {
    gVm = vm;
}

// =====================================================
// SINGLETON
// =====================================================

AudioDeviceManager& AudioDeviceManager::get() {
    static AudioDeviceManager instance;
    return instance;
}

// =====================================================
// REFRESH
// =====================================================

int AudioDeviceManager::refreshDevices() {

    if (!gVm) {
        LOGW("refreshDevices: JavaVM belum di-set");
        return 0;
    }

    ScopedEnv scope;
    if (!scope.ok()) {
        LOGE("refreshDevices: JNIEnv tidak tersedia");
        return 0;
    }
    JNIEnv* env = scope.env;
    env->PushLocalFrame(64);

    // Application context
    jclass at = env->FindClass("android/app/ActivityThread");
    jmethodID curApp = at ? env->GetStaticMethodID(at, "currentApplication",
                          "()Landroid/app/Application;") : nullptr;
    jobject app = curApp ? env->CallStaticObjectMethod(at, curApp) : nullptr;
    if (!describeAndClear(env).empty() || !app) {
        LOGE("refreshDevices: application context tidak tersedia");
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

    jobject audioManager = env->CallObjectMethod(app, getSystemService, env->NewStringUTF("audio"));
    if (!describeAndClear(env).empty() || !audioManager) {
        LOGE("refreshDevices: AudioManager tidak tersedia");
        env->PopLocalFrame(nullptr);
        return 0;
    }

    jclass amCls = env->GetObjectClass(audioManager);
    jmethodID getDevices = env->GetMethodID(amCls, "getDevices",
                                            "(I)[Landroid/media/AudioDeviceInfo;");
    if (!getDevices) {
        LOGW("refreshDevices: getDevices tidak ada (API < 23)");
        env->PopLocalFrame(nullptr);
        return 0;
    }

    // API 23: GET_DEVICES_OUTPUTS = 2
    auto devices = (jobjectArray)env->CallObjectMethod(audioManager, getDevices, 2);
    if (!describeAndClear(env).empty() || !devices) {
        LOGE("refreshDevices: getDevices mengembalikan null");
        env->PopLocalFrame(nullptr);
        return 0;
    }

    jclass diCls = env->FindClass("android/media/AudioDeviceInfo");
    jmethodID getId    = env->GetMethodID(diCls, "getId", "()I");
    jmethodID getType  = env->GetMethodID(diCls, "getType", "()I");
    jmethodID getRates = env->GetMethodID(diCls, "getSampleRates", "()[I");
    jmethodID getName  = env->GetMethodID(diCls, "getProductName", "()Ljava/lang/CharSequence;");

    std::vector<AudioDeviceDescriptor> found;
    const jsize n = env->GetArrayLength(devices);

    for (jsize i = 0; i < n; ++i) {
        jobject dev = env->GetObjectArrayElement(devices, i);
        if (!dev) continue;

        AudioDeviceDescriptor d;

        const jint numericId = getId ? env->CallIntMethod(dev, getId) : 0;
        describeAndClear(env);
        d.id = std::to_string(numericId);

        const jint androidType = getType ? env->CallIntMethod(dev, getType) : 0;
        describeAndClear(env);

        bool isUsb = false;
        d.type = mapDeviceType(androidType, isUsb);
        d.isUsb = isUsb;

        if (getName) {
            auto nm = env->CallObjectMethod(dev, getName);
            if (describeAndClear(env).empty() && nm) {
                jclass nc = env->GetObjectClass(nm);
                jmethodID ts = env->GetMethodID(nc, "toString", "()Ljava/lang/String;");
                if (ts) {
                    auto js = (jstring)env->CallObjectMethod(nm, ts);
                    if (describeAndClear(env).empty() && js) d.name = jstr(env, js);
                }
            }
        }
        if (d.name.empty()) d.name = deviceTypeName(d.type);

        if (getRates) {
            // getSampleRates() mengembalikan int[], bukan int. Memakai
            // CallIntMethod di sini salah dan menghasilkan cast pointer dari
            // integer (-Wint-to-pointer-cast). Harus CallObjectMethod.
            auto rates = getRates ? reinterpret_cast<jintArray>(env->CallObjectMethod(dev, getRates)) : nullptr;
            if (describeAndClear(env).empty() && rates) {
                const jsize rn = env->GetArrayLength(rates);
                std::vector<jint> buf(static_cast<size_t>(rn));
                env->GetIntArrayRegion(rates, 0, rn, buf.data());
                for (jint r : buf) {
                    if (r >= 8000 && r <= 768000) {
                        d.supportedSampleRates.push_back(static_cast<int32_t>(r));
                    }
                }
                std::sort(d.supportedSampleRates.begin(), d.supportedSampleRates.end());
                d.supportedSampleRates.erase(
                    std::unique(d.supportedSampleRates.begin(), d.supportedSampleRates.end()),
                    d.supportedSampleRates.end());
            }
        }

        // Laju yang disarankan = tertinggi yang didukung. Bukan konstanta:
        // HP biasanya hanya 48000, DAC bisa 384000.
        if (!d.supportedSampleRates.empty()) {
            d.preferredSampleRate = d.supportedSampleRates.back();
        }

        // Hanya USB/HDMI yang bisa punya jalur langsung ke perangkat keras.
        // Speaker dan headphone built-in SELALU lewat mixer sistem - jadi
        // jangan pernah menandainya sebagai bit-perfect capable.
        d.supportsExclusive = (d.type == DeviceType::USB_AUDIO || d.type == DeviceType::HDMI);

        found.push_back(std::move(d));
        env->DeleteLocalRef(dev);
    }

    env->PopLocalFrame(nullptr);

    {
        std::lock_guard<std::mutex> lock(mMutex);
        mDevices = std::move(found);
    }

    LOGI("refreshDevices: %zu device output terdeteksi", mDevices.size());
    for (const auto& d : mDevices) {
        std::string rates;
        char buf[24];
        for (size_t i = 0; i < d.supportedSampleRates.size(); ++i) {
            std::snprintf(buf, sizeof(buf), "%s%d", i ? "," : "", d.supportedSampleRates[i]);
            rates += buf;
        }
        LOGI("  id=%s type=%s name=\"%s\" rates=[%s] exclusive=%s",
             d.id.c_str(), deviceTypeName(d.type), d.name.c_str(), rates.c_str(),
             d.supportsExclusive ? "ya" : "tidak");
    }

    return static_cast<int>(mDevices.size());
}

// =====================================================
// QUERY
// =====================================================

std::vector<AudioDeviceDescriptor> AudioDeviceManager::getAvailableDevices() const {
    std::lock_guard<std::mutex> lock(mMutex);
    return mDevices;
}

bool AudioDeviceManager::setActiveDevice(const std::string& deviceId) {

    if (deviceId.empty()) {
        // Kosong = lepas preferensi, biarkan sistem yang memilih.
        std::lock_guard<std::mutex> lock(mMutex);
        mActiveId.clear();
        mActiveNumericId = 0;
        LOGI("setActiveDevice: preferensi dilepas (sistem yang memilih)");
        return true;
    }

    std::lock_guard<std::mutex> lock(mMutex);

    const auto it = std::find_if(mDevices.begin(), mDevices.end(),
        [&](const AudioDeviceDescriptor& d) { return d.id == deviceId; });

    if (it == mDevices.end()) {
        // PENTING: kembalikan false, bukan true-but-blind. Versi lama selalu
        // true sehingga pemanggil mengira berhasil padahal id tidak ada.
        LOGW("setActiveDevice: id '%s' tidak ada di daftar (%zu device) - DITOLAK",
             deviceId.c_str(), mDevices.size());
        return false;
    }

    mActiveId = it->id;
    try {
        mActiveNumericId = std::stoi(it->id);
    } catch (...) {
        mActiveNumericId = 0;
    }

    LOGI("setActiveDevice: '%s' (%s, %s, laju maks %d) - akan diterapkan saat stream dibuka",
         it->name.c_str(), it->id.c_str(), deviceTypeName(it->type),
         it->preferredSampleRate);

    if (!it->supportsExclusive) {
        LOGW("setActiveDevice: '%s' tidak punya jalur langsung - "
             "speaker/headphone built-in selalu lewat mixer sistem, "
             "bit-perfect ke DAC tidak mungkin di device ini",
             it->name.c_str());
    }

    return true;
}

AudioDeviceDescriptor AudioDeviceManager::getActiveDevice() const {
    std::lock_guard<std::mutex> lock(mMutex);
    const auto it = std::find_if(mDevices.begin(), mDevices.end(),
        [&](const AudioDeviceDescriptor& d) { return d.id == mActiveId; });
    if (it != mDevices.end()) return *it;
    return AudioDeviceDescriptor{};   // id kosong = tidak ada preferensi
}

DeviceCapabilities AudioDeviceManager::getDeviceCapabilities(const std::string& deviceId) const {
    std::lock_guard<std::mutex> lock(mMutex);

    DeviceCapabilities caps;
    const auto it = std::find_if(mDevices.begin(), mDevices.end(),
        [&](const AudioDeviceDescriptor& d) { return d.id == deviceId; });
    if (it != mDevices.end()) {
        caps.supportedSampleRates = it->supportedSampleRates;
        caps.supportedChannelCounts = {1, 2};
    }
    return caps;
}

int32_t AudioDeviceManager::activeDeviceIdNumeric() const {
    std::lock_guard<std::mutex> lock(mMutex);
    return mActiveNumericId;
}

// =====================================================
// CALLBACK
// =====================================================

void AudioDeviceManager::onDevicePlugged(
    std::function<void(const AudioDeviceDescriptor&)> callback) {
    std::lock_guard<std::mutex> lock(mMutex);
    mOnPlugged = std::move(callback);
}

void AudioDeviceManager::onDeviceUnplugged(
    std::function<void(const std::string&)> callback) {
    std::lock_guard<std::mutex> lock(mMutex);
    mOnUnplugged = std::move(callback);
}

void AudioDeviceManager::notifyDeviceAdded(const AudioDeviceDescriptor& d) {
    LOGI("notifyDeviceAdded: %s (%s, laju maks %d)",
         d.name.c_str(), deviceTypeName(d.type), d.preferredSampleRate);

    // Daftar di-refresh supaya pemanggil berikutnya melihat device baru.
    refreshDevices();

    std::function<void(const AudioDeviceDescriptor&)> cb;
    {
        std::lock_guard<std::mutex> lock(mMutex);
        cb = mOnPlugged;
    }
    if (cb) cb(d);
}

void AudioDeviceManager::notifyDeviceRemoved(const std::string& deviceId) {
    LOGI("notifyDeviceRemoved: id=%s", deviceId.c_str());

    bool wasActive = false;
    {
        std::lock_guard<std::mutex> lock(mMutex);
        wasActive = (mActiveId == deviceId);
    }

    refreshDevices();

    // Device yang dicabut tidak boleh tetap jadi pilihan: kalau aktif dan
    // hilang, lepas preferensinya supaya stream berikutnya tidak menunjuk
    // device yang sudah tidak ada.
    if (wasActive) {
        std::lock_guard<std::mutex> lock(mMutex);
        mActiveId.clear();
        mActiveNumericId = 0;
        LOGW("notifyDeviceRemoved: device aktif dicabut, preferensi dilepas");
    }

    std::function<void(const std::string&)> cb;
    {
        std::lock_guard<std::mutex> lock(mMutex);
        cb = mOnUnplugged;
    }
    if (cb) cb(deviceId);
}

} // namespace pristine
