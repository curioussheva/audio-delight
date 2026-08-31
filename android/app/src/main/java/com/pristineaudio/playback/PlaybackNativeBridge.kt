package com.pristineaudio.playback

import com.pristineaudio.audio.NativePlaybackModule

/**
 * Jembatan untuk memanggil kontrol playback native dari service/media session
 * tanpa perlu ReactContext.
 */
object PlaybackNativeBridge {

    fun play() {
        NativePlaybackModule.instance?.playFromService()
    }

    fun pause() {
        NativePlaybackModule.instance?.pauseFromService()
    }

    fun stop() {
        NativePlaybackModule.instance?.stopFromService()
    }

    fun seek(positionMs: Long) {
        NativePlaybackModule.instance?.seekFromService(positionMs)
    }

    fun next() {
        NativePlaybackModule.instance?.nextFromService()
    }

    fun previous() {
        NativePlaybackModule.instance?.previousFromService()
    }

    fun setShuffle(enabled: Boolean) {
        NativePlaybackModule.instance?.setShuffleFromService(enabled)
    }

    fun setRepeatMode(mode: Int) {
        NativePlaybackModule.instance?.setRepeatModeFromService(mode)
    }

    fun getQueue(): Array<String>? {
        return NativePlaybackModule.instance?.getQueueFromService()
    }

    fun setQueue(uris: Array<String>) {
        NativePlaybackModule.instance?.setQueueFromService(uris)
    }

    fun getCurrentTrack(): String? {
        return NativePlaybackModule.instance?.getCurrentTrackFromService()
    }
}