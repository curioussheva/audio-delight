#pragma once

#include <jni.h>
#include <string>

// Library `pristine-audio` dibangun dengan `-fvisibility=hidden`, sehingga
// simbol yang dipakai dari luar (OnLoad.cpp -> appmodules) harus dianotasi
// PRISTINE_EXPORT. Lihat decoder/ContentUriResolver.h untuk kasus serupa.
#include "../decoder/ContentUriResolver.h"

namespace pristine::playback {

// =====================================================
// JNI CALLBACK HELPERS (native → Java)
// =====================================================
//
// DecoderWorker jalan di thread sendiri. Supaya bisa CallVoidMethod ke
// Java, thread itu butuh JNIEnv — di-attach ke JVM via AttachCurrentThread.
// Karena NativePlaybackModule::init() dipanggil dari thread JNI saat
// constructor Java, kita simpan globalRef di situ dan JavaVM di JNI_OnLoad.

// Simpan JavaVM untuk callback native→JS. Dipanggil dari JNI_OnLoad
// (library appmodules) — harus terekspor lewat PRISTINE_EXPORT.
PRISTINE_EXPORT void initJavaVm(JavaVM* vm);

// Simpan globalRef ke instance NativePlaybackModule.
// Dipanggil dari NativePlaybackModule (thread JNI punya JNIEnv).
PRISTINE_EXPORT void initModuleRef(JNIEnv* env, jobject instance);

// Emit "onPlaybackTrackEnded" ke Java (NativePlaybackModule.onNativeTrackEnded).
// Thread-safe: attach ke JVM kalau dipanggil dari thread non-JNI.
// No-op kalau belum di-init (mis. sebelum module dibuat).
PRISTINE_EXPORT void emitTrackEnded(const std::string& uri);

} // namespace pristine::playback
