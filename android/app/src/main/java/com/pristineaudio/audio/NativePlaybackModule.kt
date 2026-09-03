package com.pristineaudio.audio

import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = NativePlaybackModule.NAME)
class NativePlaybackModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "NativePlaybackModule"

        @Volatile
        var instance: NativePlaybackModule? = null
    }

    init {
        System.loadLibrary("pristine-audio")
        instance = this
    }

    // Native methods
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

    // React methods
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
    @ReactMethod fun setQueue(uris: ReadableArray) {
    val list = ArrayList<String>()
    for (i in 0 until uris.size()) {
        val uri = uris.getString(i)
        if (uri != null) {
            list.add(resolveContentUri(uri))
        }
    }
    nativeSetQueue(list.toTypedArray())
}

private fun resolveContentUri(uriString: String): String {
    if (!uriString.startsWith("content://")) {
        return uriString
    }
    return try {
        val uri = android.net.Uri.parse(uriString)
        val pfd = reactApplicationContext.contentResolver
            .openFileDescriptor(uri, "r")
        if (pfd != null) {
            val fd = pfd.detachFd()
            "/proc/self/fd/$fd"
        } else {
            uriString
        }
    } catch (e: Exception) {
        uriString
    }
}
    @ReactMethod fun getCurrentTrack(): String = nativeGetCurrentTrack()

    // Service-friendly methods (tanpa React)
    fun playFromService() = nativePlay()
    fun pauseFromService() = nativePause()
    fun stopFromService() = nativeStop()
    fun seekFromService(positionMs: Long) = nativeSeek(positionMs)
    fun nextFromService() = nativeNext()
    fun previousFromService() = nativePrevious()
    fun setShuffleFromService(enabled: Boolean) = nativeSetShuffle(enabled)
    fun setRepeatModeFromService(mode: Int) = nativeSetRepeatMode(mode)
    fun getQueueFromService(): Array<String> = nativeGetQueue()
    fun setQueueFromService(uris: Array<String>) = nativeSetQueue(uris)
    fun getCurrentTrackFromService(): String = nativeGetCurrentTrack()
    fun getPositionFromService(): Double = nativeGetPosition().toDouble()
    fun getStatusFromService(): Int = nativeGetStatus()
} 