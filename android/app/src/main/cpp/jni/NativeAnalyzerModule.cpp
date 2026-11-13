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
#include "JniGuard.h"

#include "decoder/AudioFileAnalyzer.h"

#include <android/log.h>
#include <cstdint>
#include <cstdio>
#include <string>

namespace {

// Escape string untuk JSON: " \ dan kontrol (< 0x20) -> \u00XX.
// Error dari FFmpeg bisa berisi karakter apa pun; tanpa escape, JSON-nya
// rusak dan JSON.parse di TS throw.
//
// Byte >= 0x80: urutan UTF-8 multi-byte yang VALID diteruskan utuh
// (nama file / pesan error beraksen tetap terbaca); byte yang BUKAN
// bagian dari urutan UTF-8 yang valid diganti '?' — kalau tidak,
// NewStringUTF di bawah bisa gagal dan JSON-nya rusak.
std::string jsonEscape(const std::string& s) {
    std::string out;
    out.reserve(s.size() + 2);
    size_t i = 0;
    while (i < s.size()) {
        unsigned char c = static_cast<unsigned char>(s[i]);
        if (c < 0x80) {
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
            ++i;
            continue;
        }
        // Byte >= 0x80: coba baca satu urutan UTF-8 multi-byte.
        size_t len = 0;
        uint32_t cp = 0;
        if (c >= 0xC2 && c <= 0xDF) { len = 2; cp = c & 0x1F; }
        else if (c >= 0xE0 && c <= 0xEF) { len = 3; cp = c & 0x0F; }
        else if (c >= 0xF0 && c <= 0xF4) { len = 4; cp = c & 0x07; }
        bool valid = len > 0 && i + len <= s.size();
        if (valid) {
            for (size_t k = 1; k < len; ++k) {
                unsigned char cc = static_cast<unsigned char>(s[i + k]);
                if ((cc & 0xC0) != 0x80) { valid = false; break; }
                cp = (cp << 6) | (cc & 0x3F);
            }
        }
        if (valid) {
            // Tolak overlong, surrogate (U+D800..U+DFFF), dan > U+10FFFF.
            uint32_t minCp = len == 2 ? 0x80u : len == 3 ? 0x800u : 0x10000u;
            if (cp < minCp || cp > 0x10FFFF || (cp >= 0xD800 && cp <= 0xDFFF)) {
                valid = false;
            }
        }
        if (valid) {
            out.append(s, i, len);
            i += len;
        } else {
            // Satu '?' per byte invalid; byte berikutnya diperiksa lagi
            // (urutan terpotong / continuation yatim tidak menelan
            // byte valid sesudahnya).
            out += '?';
            ++i;
        }
    }
    return out;
}

int hexVal(char ch) {
    if (ch >= '0' && ch <= '9') return ch - '0';
    if (ch >= 'a' && ch <= 'f') return ch - 'a' + 10;
    if (ch >= 'A' && ch <= 'F') return ch - 'A' + 10;
    return -1;
}

// Decode %XX di URI file:// — pemanggil bisa mengirim URI yang
// di-encode (spasi jadi %20, huruf beraksen jadi %C3%A9, ...).
// %00 sengaja TIDAK di-decode: NUL di tengah path akan memotong
// string di FFmpeg/fopen. '%' yang tidak diikuti 2 digit hex
// dibiarkan apa adanya.
std::string percentDecode(const std::string& s) {
    std::string out;
    out.reserve(s.size());
    for (size_t i = 0; i < s.size(); ++i) {
        if (s[i] == '%' && i + 2 < s.size()) {
            int hi = hexVal(s[i + 1]);
            int lo = hexVal(s[i + 2]);
            if (hi >= 0 && lo >= 0 && (hi != 0 || lo != 0)) {
                out += static_cast<char>(hi * 16 + lo);
                i += 2;
                continue;
            }
        }
        out += s[i];
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
    return pristine::jni::guarded<jstring>(env, "nativeAnalyzeFile", nullptr, [&]() -> jstring {
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
    // juga — FFmpeg tidak butuh prefix itu. URI file:// bisa berisi
    // %XX (spasi -> %20, aksen -> %C3%A9, ...), jadi decode sekalian.
    constexpr const char* kFilePrefix = "file://";
    if (path.rfind(kFilePrefix, 0) == 0) {
        path = percentDecode(path.substr(7));
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
    });
}

} // namespace extern "C"
