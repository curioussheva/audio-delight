package com.pristineaudio.playback

import android.app.Service
import android.content.Intent
import android.os.IBinder

class PlaybackService : Service() {

    companion object {
        const val ACTION_PLAY = "com.pristineaudio.playback.PLAY"
        const val ACTION_PAUSE = "com.pristineaudio.playback.PAUSE"
        const val ACTION_NEXT = "com.pristineaudio.playback.NEXT"
        const val ACTION_PREVIOUS = "com.pristineaudio.playback.PREVIOUS"
        const val ACTION_SEEK = "com.pristineaudio.playback.SEEK"
        const val EXTRA_SEEK_POSITION = "extra_seek_position"

        @Volatile
        var instance: PlaybackService? = null
    }

    private lateinit var mediaSessionManager: MediaSessionManager

    override fun onCreate() {
        super.onCreate()
        mediaSessionManager = MediaSessionManager(this)
        instance = this
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        mediaSessionManager.startForeground()

        when (intent?.action) {
            ACTION_PLAY -> PlaybackNativeBridge.play()
            ACTION_PAUSE -> PlaybackNativeBridge.pause()
            ACTION_NEXT -> PlaybackNativeBridge.next()
            ACTION_PREVIOUS -> PlaybackNativeBridge.previous()
            ACTION_SEEK -> {
                val pos = intent.getLongExtra(EXTRA_SEEK_POSITION, 0L)
                PlaybackNativeBridge.seek(pos)
            }
        }

        return START_STICKY
    }

    fun updateMetadata(title: String, artist: String, album: String, durationMs: Long) {
        mediaSessionManager.updateMetadata(title, artist, album, durationMs)
    }

    fun updatePlaybackState(isPlaying: Boolean, positionMs: Long) {
        mediaSessionManager.updatePlaybackState(isPlaying, positionMs)
    }

    override fun onDestroy() {
        mediaSessionManager.release()
        if (instance == this) instance = null
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
} 