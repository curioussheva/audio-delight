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
    private external fun nativeNext()
    private external fun nativePrevious()
    private external fun nativeSetShuffle(enabled: Boolean)
    private external fun nativeSetRepeatMode(mode: Int)
    private external fun nativeGetQueue(): Array<String>
    private external fun nativeSetQueue(uris: Array<String>)
    private external fun nativeGetCurrentTrack(): String

    override fun getName() = NAME

    @ReactMethod fun play() { nativePlay() }
    @ReactMethod fun pause() { nativePause() }
    @ReactMethod fun stop() { nativeStop() }
    @ReactMethod fun seek(positionMs: Double) { nativeSeek(positionMs.toLong()) }
    @ReactMethod fun getPosition(): Double = nativeGetPosition().toDouble()
    @ReactMethod fun getStatus(): Int = nativeGetStatus()
    @ReactMethod fun next() { nativeNext() }
    @ReactMethod fun previous() { nativePrevious() }
    @ReactMethod fun setShuffle(enabled: Boolean) { nativeSetShuffle(enabled) }
    @ReactMethod fun setRepeatMode(mode: Int) { nativeSetRepeatMode(mode) }
    @ReactMethod fun getQueue(): Array<String> = nativeGetQueue()
    @ReactMethod fun setQueue(uris: Array<String>) { nativeSetQueue(uris) }
    @ReactMethod fun getCurrentTrack(): String = nativeGetCurrentTrack()
}