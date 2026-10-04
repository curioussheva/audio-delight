package com.pristineaudio.playback

import com.pristineaudio.audio.NativePlaybackModule

object PlaybackNativeBridge {

    // Mengembalikan Boolean: kegagalan dekoder harus sampai ke JS, supaya UI
    // tidak menampilkan "sedang diputar" padahal play() gagal di native.
    // instance null juga kegagalan - dulu dibiarkan lolos tanpa jejak.
    fun play(): Boolean {
        val inst = NativePlaybackModule.instance
        if (inst == null) {
            android.util.Log.e("PlaybackNativeBridge", "play(): instance null")
            return false
        }
        android.util.Log.d("PlaybackNativeBridge", "play() called")
        return inst.playFromService()
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

    // Indeks trek aktif menurut native. -1 kalau queue kosong / instance null.
    fun getCurrentIndex(): Int {
        return NativePlaybackModule.instance?.getCurrentIndexFromService() ?: -1
    }

    fun getQueueSize(): Int {
        return NativePlaybackModule.instance?.getQueueSizeFromService() ?: 0
    }

    fun jumpTo(index: Int): Boolean {
        android.util.Log.d("PlaybackNativeBridge", "jumpTo($index) called")
        return NativePlaybackModule.instance?.jumpToFromService(index) ?: false
    }
    
    fun getPosition(): Long {
    return NativePlaybackModule.instance?.getPositionFromService()?.toLong() ?: 0L
    }

    fun getStatus(): Int {
    return NativePlaybackModule.instance?.getStatusFromService() ?: 0
    }
    
    fun updateMetadata(title: String, artist: String, album: String, durationMs: Long) {
    android.util.Log.d("PlaybackNativeBridge", "updateMetadata($title) called")
    PlaybackService.instance?.updateMetadata(title, artist, album, durationMs)
    }

    fun updatePlaybackState(isPlaying: Boolean, positionMs: Long) {
    PlaybackService.instance?.updatePlaybackState(isPlaying, positionMs)
    }
} 