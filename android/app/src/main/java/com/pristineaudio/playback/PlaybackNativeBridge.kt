package com.pristineaudio.playback

import com.pristineaudio.audio.NativePlaybackModule

object PlaybackNativeBridge {

    fun play() {
        android.util.Log.d("PlaybackNativeBridge", "play() called")
        NativePlaybackModule.instance?.playFromService()
    }

    fun pause() {
        android.util.Log.d("PlaybackNativeBridge", "pause() called")
        NativePlaybackModule.instance?.pauseFromService()
    }

    fun stop() {
        android.util.Log.d("PlaybackNativeBridge", "stop() called")
        NativePlaybackModule.instance?.stopFromService()
    }

    fun seek(positionMs: Long) {
        android.util.Log.d("PlaybackNativeBridge", "seek($positionMs) called")
        NativePlaybackModule.instance?.seekFromService(positionMs)
    }

    fun next() {
        android.util.Log.d("PlaybackNativeBridge", "next() called")
        NativePlaybackModule.instance?.nextFromService()
    }

    fun previous() {
        android.util.Log.d("PlaybackNativeBridge", "previous() called")
        NativePlaybackModule.instance?.previousFromService()
    }

    fun setShuffle(enabled: Boolean) {
        android.util.Log.d("PlaybackNativeBridge", "setShuffle($enabled) called")
        NativePlaybackModule.instance?.setShuffleFromService(enabled)
    }

    fun setRepeatMode(mode: Int) {
        android.util.Log.d("PlaybackNativeBridge", "setRepeatMode($mode) called")
        NativePlaybackModule.instance?.setRepeatModeFromService(mode)
    }

    fun getQueue(): Array<String>? {
        android.util.Log.d("PlaybackNativeBridge", "getQueue() called")
        return NativePlaybackModule.instance?.getQueueFromService()
    }

    fun setQueue(uris: Array<String>) {
        android.util.Log.d("PlaybackNativeBridge", "setQueue(${uris.size} items) called")
        NativePlaybackModule.instance?.setQueueFromService(uris)
    }

    fun getCurrentTrack(): String? {
        android.util.Log.d("PlaybackNativeBridge", "getCurrentTrack() called")
        return NativePlaybackModule.instance?.getCurrentTrackFromService()
    }
} 