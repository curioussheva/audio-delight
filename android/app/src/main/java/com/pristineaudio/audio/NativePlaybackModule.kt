package com.pristineaudio.audio

import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = NativePlaybackModule.NAME)
class NativePlaybackModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    companion object {
        const val NAME = "NativePlaybackModule"
    }

    init {
        System.loadLibrary("pristine-audio")
    }

    private external fun nativePlay()
    private external fun nativePause()
    private external fun nativeStop()
    private external fun nativeSeek(positionMs: Long)
    private external fun nativeGetPosition(): Long
    private external fun nativeGetStatus(): Int

    override fun getName() = NAME

    @ReactMethod fun play() { nativePlay() }
    @ReactMethod fun pause() { nativePause() }
    @ReactMethod fun stop() { nativeStop() }
    @ReactMethod fun seek(positionMs: Double) { nativeSeek(positionMs.toLong()) }
    @ReactMethod fun getPosition(): Double = nativeGetPosition().toDouble()
    @ReactMethod fun getStatus(): Int = nativeGetStatus()
}