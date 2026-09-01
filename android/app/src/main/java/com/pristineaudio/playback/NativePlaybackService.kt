package com.pristineaudio.playback

import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = NativePlaybackService.NAME)
class NativePlaybackService(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "NativePlaybackService"
    }

    override fun getName() = NAME

    @ReactMethod
    fun startService() {
        val intent = android.content.Intent(reactApplicationContext, PlaybackService::class.java)
        reactApplicationContext.startForegroundService(intent)
    }

    @ReactMethod
    fun stopService() {
        val intent = android.content.Intent(reactApplicationContext, PlaybackService::class.java)
        reactApplicationContext.stopService(intent)
    }

    @ReactMethod
    fun play() = PlaybackNativeBridge.play()

    @ReactMethod
    fun pause() = PlaybackNativeBridge.pause()

    @ReactMethod
    fun stop() = PlaybackNativeBridge.stop()

    @ReactMethod
    fun next() = PlaybackNativeBridge.next()

    @ReactMethod
    fun previous() = PlaybackNativeBridge.previous()

    @ReactMethod
    fun seek(positionMs: Double) = PlaybackNativeBridge.seek(positionMs.toLong())

    @ReactMethod
    fun setShuffle(enabled: Boolean) = PlaybackNativeBridge.setShuffle(enabled)

    @ReactMethod
    fun setRepeatMode(mode: Int) = PlaybackNativeBridge.setRepeatMode(mode)

    @ReactMethod
    fun setQueue(uris: Array<String>) = PlaybackNativeBridge.setQueue(uris)

    @ReactMethod
    fun getPosition(promise: Promise) {
        promise.resolve(PlaybackNativeBridge.getPosition().toDouble())
    }

    @ReactMethod
    fun getStatus(promise: Promise) {
        promise.resolve(PlaybackNativeBridge.getStatus())
    }

    @ReactMethod
    fun getQueue(promise: Promise) {
        val queue = PlaybackNativeBridge.getQueue()
        promise.resolve(queue?.toList() ?: emptyList<Any>())
    }

    @ReactMethod
    fun getCurrentTrack(promise: Promise) {
        promise.resolve(PlaybackNativeBridge.getCurrentTrack() ?: "")
    }
}