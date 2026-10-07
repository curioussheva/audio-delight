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

    fun setQueue(uris: Array<String>, sampleRates: IntArray = IntArray(uris.size)) {
        android.util.Log.d("PlaybackNativeBridge", "setQueue(${uris.size} items) called")
        NativePlaybackModule.instance?.setQueueFromService(uris, sampleRates)
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
    
    fun updateMetadata(
        title: String,
        artist: String,
        album: String,
        durationMs: Long,
        artworkUri: String?,
    ) {
        android.util.Log.d("PlaybackNativeBridge", "updateMetadata($title) called")
        PlaybackService.instance?.updateMetadata(title, artist, album, durationMs, artworkUri)
    }

    fun updatePlaybackState(isPlaying: Boolean, positionMs: Long) {
        PlaybackService.instance?.updatePlaybackState(isPlaying, positionMs)
    }

    // 🔥 Event native→JS: kirim info trek ke JS tanpa polling.
    // Dipanggil saat track berganti dari sisi native (notification / C++ advance).
    fun emitTrackChanged(uri: String, index: Int) {
        try {
            val module = NativePlaybackModule.instance ?: return
            val ctx = module.reactContext
            ctx.getJSModule(com.facebook.react.modules.core.DeviceEventManagerModule
                .RCTDeviceEventEmitter::class.java)
                .emit("onPlaybackTrackChanged", androidx.core.util.Pair(uri, index))
        } catch (e: Exception) {
            android.util.Log.w("PlaybackNativeBridge", "emitTrackChanged: ${e.message}")
        }
    }

    // 🔥 Event native→JS: track selesai (EOF). Dulu JS nebak-nebak pakai
    // __trackEndWatcher polling; sekarang C++ yang kasih tahu.
    fun emitTrackEnded(uri: String) {
        try {
            val module = NativePlaybackModule.instance ?: return
            val ctx = module.reactContext
            ctx.getJSModule(com.facebook.react.modules.core.DeviceEventManagerModule
                .RCTDeviceEventEmitter::class.java)
                .emit("onPlaybackTrackEnded", uri)
        } catch (e: Exception) {
            android.util.Log.w("PlaybackNativeBridge", "emitTrackEnded: ${e.message}")
        }
    }

    // 🔥 MediaSession shuffle/repeat sync. Dipanggil dari NativePlaybackService
    // ReactMethod (updateShuffleMode/updateRepeatMode).
    fun updateShuffleMode(enabled: Boolean) {
        PlaybackService.instance?.updateShuffleMode(enabled)
    }

    fun updateRepeatMode(mode: Int) {
        PlaybackService.instance?.updateRepeatMode(mode)
    }
} 