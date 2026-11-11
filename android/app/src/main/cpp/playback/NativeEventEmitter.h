#pragma once

#include <jni.h>
#include <string>

// PRISTINE_EXPORT dari core/Export.h (satu sumber untuk semua).
// Sebelumnya header ini meng-include decoder/ContentUriResolver.h hanya untuk
// mendapat makronya - ketergantungan yang tidak perlu dan rapuh: kalau file
// itu berubah, header ini ikut rusak tanpa alasan.
#include "core/Export.h"

namespace pristine::playback {

// =====================================================
// JNI CALLBACK HELPERS (native → Java)
// =====================================================
//
// DecoderWorker jalan di thread sendiri. Supaya bisa CallVoidMethod ke
// Java, thread itu butuh JNIEnv — di-attach ke JVM via AttachCurrentThread.
// JavaVM disimpan lewat initJavaVm() yang dipanggil dari JNI_OnLoad
// (OnLoad.cpp). KOREKSI 2026-11-11 (J-m7): registrasi modul TIDAK lagi
// lewat constructor Java — native readiness dijamin lazy lewat
// ensureNativeReady() di Kotlin (NativePlaybackModule.kt).

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
