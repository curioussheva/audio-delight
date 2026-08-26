package com.pristineaudio.audio

import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.turbomodule.core.interfaces.TurboModule

@ReactModule(name = NativePristineAudio.NAME)
class NativePristineAudio(reactContext: ReactApplicationContext) : 
    ReactContextBaseJavaModule(reactContext),
    TurboModule {

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
    @ReactMethod fun pushAudio(data: ReadableArray, size: Int) {
    val floatArray = FloatArray(data.size())
    for (i in 0 until data.size()) {
        floatArray[i] = data.getDouble(i).toFloat()
    }
    nativePushAudio(floatArray, size)
}
    @ReactMethod fun isRunning(): Boolean = nativeIsRunning()
    @ReactMethod fun getLatency(): Float = nativeGetLatency()
    @ReactMethod fun getUnderruns(): Long = nativeGetUnderruns()
    @ReactMethod fun getOverruns(): Long = nativeGetOverruns()
}
