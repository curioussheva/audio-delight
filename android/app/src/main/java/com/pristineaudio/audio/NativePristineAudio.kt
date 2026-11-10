package com.pristineaudio.audio

import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import com.pristineaudio.NativeLibrary

@ReactModule(name = NativePristineAudio.NAME)
class NativePristineAudio(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    companion object {
        const val NAME = "NativePristineAudio"
    }

    // 🔥 LAZY LOAD (2026-11-10): System.loadLibrary TIDAK lagi di init.
    // Load terjadi di NativeLibrary.ensureLoaded(), saat pertama kali ada
    // panggilan native (JS thread) — bukan di main thread saat cold start.

    private external fun nativeStart()
    private external fun nativeStop()
    private external fun nativePushAudio(data: FloatArray, size: Int)
    private external fun nativeIsRunning(): Boolean
    private external fun nativeGetLatency(): Float
    private external fun nativeGetUnderruns(): Long
    private external fun nativeGetOverruns(): Long

    override fun getName() = NAME

    @ReactMethod fun startEngine() { if (NativeLibrary.ensureLoaded()) nativeStart() }
    @ReactMethod fun stopEngine() { if (NativeLibrary.ensureLoaded()) nativeStop() }
    @ReactMethod fun pushAudio(data: FloatArray, size: Int) { if (NativeLibrary.ensureLoaded()) nativePushAudio(data, size) }
    @ReactMethod fun isRunning(): Boolean = if (NativeLibrary.ensureLoaded()) nativeIsRunning() else false
    @ReactMethod fun getLatency(): Float = if (NativeLibrary.ensureLoaded()) nativeGetLatency() else 0f
    @ReactMethod fun getUnderruns(): Double = if (NativeLibrary.ensureLoaded()) nativeGetUnderruns().toDouble() else 0.0
    @ReactMethod fun getOverruns(): Double = if (NativeLibrary.ensureLoaded()) nativeGetOverruns().toDouble() else 0.0
}