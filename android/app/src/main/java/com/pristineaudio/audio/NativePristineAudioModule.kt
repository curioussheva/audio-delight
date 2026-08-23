package com.pristineaudio.audio

import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = NativePristineAudioModule.NAME)
class NativePristineAudioModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    companion object {
        const val NAME = "NativePristineAudio"
    }

    init {
        System.loadLibrary("pristine-audio")
    }

    private external fun nativeStart()
    private external fun nativeStop()
    private external fun nativePushAudio(data: FloatArray, size: Int)
    private external fun nativeIsRunning(): Boolean
    private external fun nativeGetLatency(): Float
    private external fun nativeGetUnderruns(): Long
    private external fun nativeGetOverruns(): Long

    override fun getName() = NAME

    @ReactMethod fun startEngine() { nativeStart() }
    @ReactMethod fun stopEngine() { nativeStop() }
    @ReactMethod fun pushAudio(data: FloatArray, size: Int) { nativePushAudio(data, size) }
    @ReactMethod fun isRunning(): Boolean = nativeIsRunning()
    @ReactMethod fun getLatency(): Float = nativeGetLatency()
    @ReactMethod fun getUnderruns(): Double = nativeGetUnderruns().toDouble()
    @ReactMethod fun getOverruns(): Double = nativeGetOverruns().toDouble()
}