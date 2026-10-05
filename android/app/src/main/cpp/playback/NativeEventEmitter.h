#pragma once

#include <jni.h>
#include <string>

namespace pristine::playback {

// =====================================================
// JNI CALLBACK HELPERS (native → Java)
// =====================================================
//
// DecoderWorker jalan di thread sendiri. Supaya bisa CallVoidMethod ke
// Java, thread itu butuh JNIEnv — di-attach ke JVM via AttachCurrentThread.
// Karena NativePlaybackModule::init() dipanggil dari thread JNI saat
// constructor Java, kita simpan globalRef di situ dan JavaVM di JNI_OnLoad.

void initJavaVm(JavaVM* vm);

// Simpan globalRef ke instance NativePlaybackModule.
// Dipanggil dari NativePlaybackModule (thread JNI punya JNIEnv).
void initModuleRef(JNIEnv* env, jobject instance);

// Emit "onPlaybackTrackEnded" ke Java (NativePlaybackModule.onNativeTrackEnded).
// Thread-safe: attach ke JVM kalau dipanggil dari thread non-JNI.
// No-op kalau belum di-init (mis. sebelum module dibuat).
void emitTrackEnded(const std::string& uri);

} // namespace pristine::playback
