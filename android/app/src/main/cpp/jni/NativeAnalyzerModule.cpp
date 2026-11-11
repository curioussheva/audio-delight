// =====================================================
// jni/NativeAnalyzerModule.cpp
// =====================================================
//
// JNI untuk analisis spektral offline (decoder/AudioFileAnalyzer).
// Satu fungsi: nativeAnalyzeFile(uri) -> JSON string, atau null kalau
// gagal (Kotlin me-reject Promise-nya).
//
// Dibuat 2026-11-11 (deteksi file hi-res/lossless palsu).
//
// Pelajaran J-M5 (2026-11-11): semua hasil JNI dicek — GetStringUTFChars
// null, exception pending di-clear sebelum NewStringUTF (kalau tidak,
// NewStringUTF jadi no-op dan mengembalikan null diam-diam).

#include <jni.h>

#include "decoder/AudioFileAnalyzer.h"

#include <android/log.h>
#include <cstdio>
#include <string>

namespace {

// Escape string untuk JSON: " \ dan kontrol (< 0x20) -> \u00XX.
// Error dari FFmpeg bisa berisi karakter apa pun; tanpa escape, JSON-nya
// rusak dan JSON.parse di TS throw.
std::string jsonEscape(const std::string& s) {
    std::string out;
    out.reserve(s.size() + 2);
    for (unsigned char c : s) {
        switch (c) {
            case '"': out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default:
                if (c < 0x20) {
                    char buf[8];
                    std::snprintf(buf, sizeof(buf), "\\u%04x", c);
                    out += buf;
                } else {
                    out += static_cast<char>(c);
                }
        }
    }
    return out;
}

} // namespace

extern "C" {

JNIEXPORT jstring JNICALL
Java_com_pristineaudio_audio_NativeAnalyzerModule_nativeAnalyzeFile(
    JNIEnv* env,
    jobject /* thiz */,
    jstring jUri
) {
    if (!jUri) return nullptr;

    const char* cUri = env->GetStringUTFChars(jUri, nullptr);
    if (!cUri) {
        // OutOfMemoryError sudah pending — biarkan naik ke Kotlin.
        return nullptr;
    }

    std::string path(cUri);
    env->ReleaseStringUTFChars(jUri, cUri);
    if (env->ExceptionCheck()) {
        env->ExceptionClear();
        return nullptr;
    }

    // TS sudah mengirim plain path, tapi potong "file://" defensif di sini
    // juga — FFmpeg tidak butuh prefix itu.
    constexpr const char* kFilePrefix = "file://";
    if (path.rfind(kFilePrefix, 0) == 0) {
        path = path.substr(7);
    }

    const pristine::analyzer::SpectralAnalysis r =
        pristine::analyzer::analyzeFile(path);

    std::string json;
    if (!r.ok) {
        __android_log_print(ANDROID_LOG_WARN, "NativeAnalyzerModule",
                            "analyzeFile gagal: %s", r.error.c_str());
        json = "{\"ok\":false,\"error\":\"" + jsonEscape(r.error) + "\"}";
    } else {
        char buf[512];
        std::snprintf(buf, sizeof(buf),
                      "{\"ok\":true,"
                      "\"durationSeconds\":%.3f,"
                      "\"sampleRate\":%u,"
                      "\"channels\":%u,"
                      "\"measuredCutoffHz\":%.1f,"
                      "\"peakDbfs\":%.2f,"
                      "\"rmsDbfs\":%.2f,"
                      "\"lsbZeroRatio16\":%.4f,"
                      "\"windowsUsed\":%d}",
                      r.durationSeconds, r.sampleRate, r.channels,
                      r.measuredCutoffHz, r.peakDbfs, r.rmsDbfs,
                      r.lsbZeroRatio16, r.windowsUsed);
        json = buf;
    }

    jstring out = env->NewStringUTF(json.c_str());
    if (env->ExceptionCheck()) {
        env->ExceptionClear();
        return nullptr;
    }
    return out;
}

} // namespace extern "C"
