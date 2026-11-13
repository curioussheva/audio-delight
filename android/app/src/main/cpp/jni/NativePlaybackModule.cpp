#include "NativePlaybackModule.h"
#include "JniGuard.h"
#include "manager/EngineManager.h"
#include "playback/PlaybackController.h"
#include "playback/TrackQueue.h"
#include "playback/NativeEventEmitter.h"
#include <android/log.h>
#include <atomic>
#include <cstdint>
#include <mutex>
#include <vector>
#include <string>

static pristine::playback::PlaybackController* gPlaybackController = nullptr;

// Controller-only: initialize controller kalau belum, TAPI JANGAN start engine.
//
// 🔥 FIX (2026-10-07): dulu fungsi ini sekaligus menyalakan engine, dan semua
// JNI function memakainya. Akibatnya nativeSetQueue - yang dipanggil JS SEBELUM
// play, saat queue masih kosong - sudah membuka stream di laju terdeteksi
// (tertinggi perangkat) sebelum laju file diketahui. play() lalu menemukan
// engine sudah running dan tidak pernah membukanya ulang di laju track.
//
// Sekarang hanya transport (play) yang menyalakan engine, dan itu terjadi
// setelah queue terisi dan track dimuat - jadi stream dibuka di laju file.
static pristine::playback::PlaybackController* getController() {
    // 🔥 FIX (2026-11-11, J-m2): init sekali saja. Tanpa lock, dua thread
    // di panggilan JNI pertama bisa sama-sama melihat pointer null +
    // initialize() cek initialized_ tanpa CAS — double init menimpa member
    // (queue/clock/state) → split-brain. Aman pakai call_once:
    // initialize() selalu return true (tidak ada jalur gagal).
    static std::once_flag initFlag;
    std::call_once(initFlag, [] {
        gPlaybackController = &pristine::EngineManager::get().playback();
        if (!gPlaybackController->isInitialized()) {
            gPlaybackController->initialize();
            __android_log_print(ANDROID_LOG_DEBUG, "NativePlaybackModule", "controller initialized");
        }
    });

    __android_log_print(ANDROID_LOG_DEBUG, "NativePlaybackModule", "getController: controller=%p", (void*)gPlaybackController);

    return gPlaybackController;
}

// Controller + engine, dipakai HANYA oleh play() (transport yang benar-benar
// butuh stream audio berjalan).
static pristine::playback::PlaybackController* getControllerAndStartEngine() {
    auto* controller = getController();
    if (!controller) return nullptr;

    if (!pristine::EngineManager::get().engine().isRunning()) {
        // 🔥 FIX (2026-10-07): muat track SEBELUM engine start kalau queue
        // sudah punya track.
        //
        // Bit-perfect butuh stream dibuka di laju track. loadTrack() mengisi
        // laju file ke controller, dan EngineManager::start() memakainya lewat
        // pickBestRate() untuk memilih laju stream.
        //
        // hasDecoder(): loadTrack me-reset posisi dan clock, jadi hanya
        // dijalankan kalau belum ada decoder. Tanpa guard ini, setiap play()
        // selama engine belum running akan me-reset playback.
        if (!controller->hasDecoder()) {
            if (auto queue = controller->queue()) {
                if (auto track = queue->current()) {
                    __android_log_print(ANDROID_LOG_INFO, "NativePlaybackModule",
                        "play: preload track sebelum start, laju file=%u",
                        track->sampleRate);
                    controller->loadTrack(*track);
                }
            }
        }

        pristine::EngineManager::get().start();
        __android_log_print(ANDROID_LOG_DEBUG, "NativePlaybackModule", "engine started");
    }

    return controller;
}

extern "C" {

// 🔥 Simpan reference ke Java module untuk callback native→JS.
// Dipanggil dari NativePlaybackModule.kt init {} — thread yang punya JNIEnv.
JNIEXPORT void JNICALL
Java_com_pristineaudio_audio_NativePlaybackModule_nativeInitEventEmitter(
    JNIEnv* env, jobject instance
) {
    pristine::jni::guardedVoid(env, "nativeInitEventEmitter", [&] {
    pristine::playback::initModuleRef(env, instance);
    });
}

// Mengembalikan jboolean supaya lapisan atas bisa tahu play() GAGAL.
// Sebelumnya void: kegagalan dekoder (mis. avformat_open_input failed untuk
// URI yang belum di-resolve) hilang begitu saja dan UI tetap menampilkan
// "sedang diputar" walau tidak ada suara. Terbukti pada logcat 2026-10-04
// 12:22 - play(): FAILED tiga kali, tapi updateMetadata tetap jalan.
JNIEXPORT jboolean JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativePlay(JNIEnv* env, jobject) {
    return pristine::jni::guarded<jboolean>(env, "nativePlay", JNI_FALSE, [&]() -> jboolean {
    __android_log_print(ANDROID_LOG_INFO, "NativePlaybackModule",
                        "nativePlay() called from JS");
    // getControllerAndStartEngine: play() adalah satu-satunya transport yang
    // memulai stream, dan ia melakukannya SETELAH queue terisi, supaya stream
    // dibuka di laju track (bit-perfect).
    auto* controller = getControllerAndStartEngine();
    if (!controller) {
        __android_log_print(ANDROID_LOG_ERROR, "NativePlaybackModule",
                            "nativePlay: controller null!");
        return JNI_FALSE;
    }
    const bool ok = controller->play();
    __android_log_print(ANDROID_LOG_INFO, "NativePlaybackModule",
                        "nativePlay() returned ok=%d", ok ? 1 : 0);
    return ok ? JNI_TRUE : JNI_FALSE;
    });
}

JNIEXPORT void JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativePause(JNIEnv* env, jobject) {
    pristine::jni::guardedVoid(env, "nativePause", [&] {
    auto* controller = getController();
    if (controller) controller->pause();
    });
}

JNIEXPORT void JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativeStop(JNIEnv* env, jobject) {
    pristine::jni::guardedVoid(env, "nativeStop", [&] {
    auto* controller = getController();
    if (controller) controller->stop();
    });
}

JNIEXPORT void JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativeSeek(JNIEnv* env, jobject, jlong positionMs) {
    pristine::jni::guardedVoid(env, "nativeSeek", [&] {
    auto* controller = getController();
    if (controller) controller->seek(static_cast<double>(positionMs) / 1000.0);
    });
}

JNIEXPORT jlong JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativeGetPosition(JNIEnv* env, jobject) {
    return pristine::jni::guarded<jlong>(env, "nativeGetPosition", 0, [&]() -> jlong {
    auto* controller = getController();
    if (!controller) return 0;
    // PB6-W2C (2026-11-12): log NaN dari thread polling, bukan audio
    // thread. Jalur ini dipanggil JS tiap 500 ms (position watcher
    // playerStore + useAudioPlayer), jadi log paling banyak 2/dtk dan
    // HANYA bila total bertambah sejak poll terakhir — render() sendiri
    // tidak pernah log lagi, hanya fetch_add ke mNanTotal_.
    // static atomic (bukan plain static): nativeGetPosition bisa
    // dipanggil dari thread JS maupun thread service
    // (PlaybackNativeBridge::getPosition) — plain static = data race.
    static std::atomic<uint32_t> lastLoggedNanTotal{0};
    const uint32_t nanTotal = controller->nanCleanedTotal();
    const uint32_t lastLogged =
        lastLoggedNanTotal.load(std::memory_order_relaxed);
    if (nanTotal > lastLogged) {
        lastLoggedNanTotal.store(nanTotal, std::memory_order_relaxed);
        __android_log_print(ANDROID_LOG_WARN, "PlaybackController",
                            "render: cleaned %u NaN samples since last poll (total=%u)",
                            nanTotal - lastLogged, nanTotal);
    }
    return static_cast<jlong>(controller->state()->getPosition().positionMs);
    });
}

JNIEXPORT jint JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativeGetStatus(JNIEnv* env, jobject) {
    return pristine::jni::guarded<jint>(env, "nativeGetStatus", 0, [&]() -> jint {
    auto* controller = getController();
    if (!controller) return 0;
    return static_cast<jint>(controller->state()->getStatus());
    });
}

// Indeks trek aktif di queue native. Native yang memegang queue dan indeks,
// jadi JS harus menanyakan ini alih-alih menghitung sendiri - kalau JS
// menghitung sendiri, shuffle dan repeat di sisi native tidak terhitung dan
// lagu yang dimuat bisa berbeda dari yang ditampilkan UI.
JNIEXPORT jint JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativeGetCurrentIndex(JNIEnv* env, jobject) {
    return pristine::jni::guarded<jint>(env, "nativeGetCurrentIndex", -1, [&]() -> jint {
    auto* controller = getController();
    if (!controller || !controller->queue()) return -1;
    // activeTracks(), BUKAN tracks(): indeks ini menunjuk posisi di queue
    // yang benar-benar diputar native. Saat shuffle menyala, urutannya
    // berbeda dari urutan file asli, jadi memakai tracks() membuat UI
    // menampilkan lagu/posisi yang salah.
    if (controller->queue()->activeTracks().empty()) return -1;
    return static_cast<jint>(controller->queue()->currentIndex());
    });
}

// Jumlah trek di queue native. Dipakai JS untuk memvalidasi indeks dan
// mendeteksi queue yang berubah di luar kendalinya.
JNIEXPORT jint JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativeGetQueueSize(JNIEnv* env, jobject) {
    return pristine::jni::guarded<jint>(env, "nativeGetQueueSize", 0, [&]() -> jint {
    auto* controller = getController();
    if (!controller || !controller->queue()) return 0;
    // Ukuran sama untuk tracks() dan activeTracks() (hanya urutannya beda),
    // tapi activeTracks() dipakai supaya satu sumber kebenaran.
    return static_cast<jint>(controller->queue()->activeTracks().size());
    });
}

// Lompat ke indeks tertentu di queue native lalu muat treknya.
// next()/previous() di C++ sudah memuat track sendiri, jadi jalur ini dibuat
// sama: jumpTo di queue, lalu loadTrack. Tanpa memuat di sini, JS harus
// memanggil setQueue ulang hanya untuk berpindah trek - itu menimpa queue
// native dan membuang indeks yang sudah dihitung native (termasuk urutan
// shuffle yang hanya diketahui native).
JNIEXPORT jboolean JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativeJumpTo(JNIEnv* env, jobject, jint index) {
    return pristine::jni::guarded<jboolean>(env, "nativeJumpTo", JNI_FALSE, [&]() -> jboolean {
    auto* controller = getController();
    if (!controller || !controller->queue() || index < 0) return JNI_FALSE;

    auto q = controller->queue();
    // activeTracks(): indeks dari JS adalah indeks di queue AKTIF (yang
    // ditampilkan UI, sudah memperhitungkan shuffle). Memvalidasi terhadap
    // tracks() akan menerima indeks yang menunjuk lagu berbeda saat shuffle.
    if (static_cast<size_t>(index) >= q->activeTracks().size()) return JNI_FALSE;
    if (!q->jumpTo(static_cast<size_t>(index))) return JNI_FALSE;

    auto track = q->current();
    if (!track) return JNI_FALSE;
    return controller->loadTrack(*track) ? JNI_TRUE : JNI_FALSE;
    });
}

JNIEXPORT void JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativeNext(JNIEnv* env, jobject) {
    pristine::jni::guardedVoid(env, "nativeNext", [&] {
    auto* controller = getController();
    if (controller) controller->next();
    });
}

JNIEXPORT void JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativePrevious(JNIEnv* env, jobject) {
    pristine::jni::guardedVoid(env, "nativePrevious", [&] {
    auto* controller = getController();
    if (controller) controller->previous();
    });
}

JNIEXPORT void JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativeSetShuffle(JNIEnv* env, jobject, jboolean enabled) {
    pristine::jni::guardedVoid(env, "nativeSetShuffle", [&] {
    auto* controller = getController();
    if (controller) controller->setShuffle(enabled);
    });
}

JNIEXPORT void JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativeSetRepeatMode(JNIEnv* env, jobject, jint mode) {
    pristine::jni::guardedVoid(env, "nativeSetRepeatMode", [&] {
    // 🔥 KOREKSI (2026-11-11, J-M1): enum C++ RepeatMode (PlaybackTypes.h)
    // = Off 0, One 1, All 2 — sama dengan konstanta Android. Peta TS lama
    // (all:1, track:2) TERBALIK; peta TS sudah dibetulkan, tapi JNI tetap
    // guard nilai di luar 0-2 (static_cast enum tanpa range check = UB
    // semantik: nilai 3+ masuk switch TrackQueue tanpa case → return false).
    if (mode < 0 || mode > 2) {
        __android_log_print(ANDROID_LOG_WARN, "NativePlaybackModule",
                            "nativeSetRepeatMode: mode %d di luar 0-2, diabaikan", (int)mode);
        return;
    }
    auto* controller = getController();
    if (controller) controller->setRepeatMode(static_cast<pristine::playback::RepeatMode>(mode));
    });
}

JNIEXPORT void JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativeSetPlaybackRate(JNIEnv* env, jobject, jfloat rate) {
    pristine::jni::guardedVoid(env, "nativeSetPlaybackRate", [&] {
    auto* controller = getController();
    if (controller) controller->setPlaybackRate(rate);
    });
}

// 🔥 FASE R (2026-11-11): retune — rasio pitch (1.0 = A=440, 432/440 = A=432).
JNIEXPORT void JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativeSetPitchRatio(JNIEnv* env, jobject, jfloat ratio) {
    pristine::jni::guardedVoid(env, "nativeSetPitchRatio", [&] {
    auto* controller = getController();
    if (controller) controller->setPitchRatio(ratio);
    });
}

JNIEXPORT jobjectArray JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativeGetQueue(JNIEnv* env, jobject) {
    return pristine::jni::guarded<jobjectArray>(env, "nativeGetQueue", nullptr, [&]() -> jobjectArray {
    // 🔥 FIX (2026-11-11, J-M5/J-m9): guard queue() + cek FindClass/
    // NewStringUTF. FindClass yang gagal meninggalkan exception pending;
    // NewObjectArray/NewStringUTF sesudahnya jadi no-op dan array
    // teracuni null. Kotlin mengharapkan Array<String> non-null — semua
    // jalur error kembalikan array KOSONG, bukan nullptr.
    jclass stringClass = env->FindClass("java/lang/String");
    if (!stringClass) {
        env->ExceptionClear();
        stringClass = env->FindClass("java/lang/Object");
        if (!stringClass) {
            env->ExceptionClear();
            return nullptr; // APK rusak; tidak ada yang bisa dikembalikan
        }
    }

    auto* controller = getController();
    if (!controller) return env->NewObjectArray(0, stringClass, nullptr);

    auto queuePtr = controller->queue();
    if (!queuePtr) return env->NewObjectArray(0, stringClass, nullptr);

    // activeTracks(): JS memakai daftar ini untuk menampilkan urutan queue.
    // Kalau yang dikirim tracks() (urutan file asli), daftar di UI tidak
    // cocok dengan urutan yang benar-benar diputar saat shuffle menyala.
    auto queue = queuePtr->activeTracks();
    jobjectArray result = env->NewObjectArray(queue.size(), stringClass, nullptr);
    if (!result) {
        env->ExceptionClear();
        return env->NewObjectArray(0, stringClass, nullptr);
    }
    for (size_t i = 0; i < queue.size(); ++i) {
        jstring str = env->NewStringUTF(queue[i].uri.c_str());
        if (!str) {
            // URI invalid/OOM: bersihkan exception, lewati entri ini
            // (tetap null di index itu) daripada meracuni seluruh array.
            env->ExceptionClear();
            continue;
        }
        env->SetObjectArrayElement(result, i, str);
        env->DeleteLocalRef(str);
    }
    return result;
    });
}

// `uris`  = daftar URI track (wajib).
// `rates` = laju file per track dalam Hz (opsional, boleh null).
//
// 🔥 FIX (2026-10-07): laju file ikut masuk ke TrackInfo supaya engine bisa
// membuka stream di laju track (bit-perfect), bukan di laju tertinggi
// perangkat. Sebelumnya array ini tidak ada dan sampleRate selalu 0, jadi
// informasi laju file hilang sebelum sampai ke C++.
//
// Elemen rates yang 0 / array lebih pendek dari uris = laju tidak diketahui;
// engine akan mendeteksi sendiri untuk track itu.
JNIEXPORT void JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativeSetQueue(
    JNIEnv* env, jobject, jobjectArray uris, jintArray rates) {
    pristine::jni::guardedVoid(env, "nativeSetQueue", [&] {

    __android_log_print(ANDROID_LOG_INFO, "NativePlaybackModule",
                        "nativeSetQueue() called");

    auto* controller = getController();
    if (!controller) {
        __android_log_print(ANDROID_LOG_ERROR, "NativePlaybackModule",
                            "nativeSetQueue: controller null!");
        return;
    }

    // 🔥 FIX (2026-11-11, J-M5): uris wajib — GetArrayLength(nullptr)
    // crash/UB. Kotlin tidak pernah kirim null, tapi guard murah.
    if (!uris) {
        __android_log_print(ANDROID_LOG_ERROR, "NativePlaybackModule",
                            "nativeSetQueue: uris null!");
        return;
    }

    jsize length = env->GetArrayLength(uris);
    __android_log_print(ANDROID_LOG_INFO, "NativePlaybackModule",
                        "nativeSetQueue: length=%d", (int)length);

    // Laju file dibaca sekali di luar loop; jumlahnya boleh lebih pendek.
    jsize rateCount = 0;
    std::vector<jint> rateValues;
    if (rates) {
        rateCount = env->GetArrayLength(rates);
        if (rateCount > 0) {
            rateValues.resize(static_cast<size_t>(rateCount));
            env->GetIntArrayRegion(
                rates, 0, rateCount, rateValues.data()
            );
        }
    }

    std::vector<pristine::playback::TrackInfo> tracks;
    tracks.reserve(static_cast<size_t>(length));
    for (jsize i = 0; i < length; ++i) {
        jstring js = (jstring) env->GetObjectArrayElement(uris, i);
        if (!js) continue;

        const char* cstr = env->GetStringUTFChars(js, nullptr);
        if (!cstr) { env->DeleteLocalRef(js); continue; }

        // B12-W4: log ringkas — total sudah di-log di atas (length=%d),
        // di sini hanya 3 URI pertama supaya antrean besar tidak
        // membanjiri logcat dengan 1 baris INFO per URI.
        if (i < 3) {
            __android_log_print(ANDROID_LOG_INFO, "NativePlaybackModule",
                                "nativeSetQueue: URI[%d] = %s", (int)i, cstr);
        }

        pristine::playback::TrackInfo info;
        info.uri = cstr;

        // Laju file: hanya terima nilai yang masuk akal sebagai laju audio.
        // Nilai sampah (0, negatif, di luar rentang) dibiarkan 0 supaya engine
        // mendeteksi sendiri alih-alih membuka stream di laju tidak valid.
        if (i < rateCount) {
            const int32_t rate = static_cast<int32_t>(rateValues[static_cast<size_t>(i)]);
            if (rate >= 8000 && rate <= 768000) {
                info.sampleRate = static_cast<uint32_t>(rate);
            }
        }

        tracks.push_back(info);

        env->ReleaseStringUTFChars(js, cstr);
        env->DeleteLocalRef(js);
    }

    controller->queue()->setTracks(tracks);
    __android_log_print(ANDROID_LOG_INFO, "NativePlaybackModule",
                        "nativeSetQueue: setTracks called with %zu tracks",
                        tracks.size());
    });
}

JNIEXPORT jstring JNICALL Java_com_pristineaudio_audio_NativePlaybackModule_nativeGetCurrentTrack(JNIEnv* env, jobject) {
    return pristine::jni::guarded<jstring>(env, "nativeGetCurrentTrack", nullptr, [&]() -> jstring {
    auto* controller = getController();
    if (!controller) return env->NewStringUTF("");
    auto queuePtr = controller->queue(); // 🔥 J-m9: guard queue()
    if (!queuePtr) return env->NewStringUTF("");
    auto track = queuePtr->current();
    if (track) {
        return env->NewStringUTF(track->uri.c_str());
    }
    return env->NewStringUTF("");
    });
}

} // extern "C"