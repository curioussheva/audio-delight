package com.pristineaudio.playback

import android.content.Intent
import android.os.Bundle
import androidx.media.MediaBrowserServiceCompat
import androidx.media.MediaBrowserServiceCompat.BrowserRoot
import androidx.media.MediaBrowserServiceCompat.Result
import androidx.media.MediaBrowserCompat.MediaItem

class PlaybackService : MediaBrowserServiceCompat() {

    companion object {
        const val ACTION_PLAY = "com.pristineaudio.playback.PLAY"
        const val ACTION_PAUSE = "com.pristineaudio.playback.PAUSE"
        const val ACTION_NEXT = "com.pristineaudio.playback.NEXT"
        const val ACTION_PREVIOUS = "com.pristineaudio.playback.PREVIOUS"
        const val ACTION_SEEK = "com.pristineaudio.playback.SEEK"
        const val EXTRA_SEEK_POSITION = "extra_seek_position"
    }

    private lateinit var mediaSessionManager: MediaSessionManager

    override fun onCreate() {
        super.onCreate()
        mediaSessionManager = MediaSessionManager(this)
    }

    override fun onGetRoot(
        clientPackageName: String,
        clientUid: Int,
        rootHints: Bundle?
    ): BrowserRoot? {
        // Untuk sekarang izinkan semua client
        return BrowserRoot("root", null)
    }

    override fun onLoadChildren(
        parentId: String,
        result: Result<MutableList<MediaItem>>
    ) {
        // TODO: ambil daftar antrian dari PlaybackController / TrackQueue
        result.sendResult(mutableListOf())
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

    override fun onDestroy() {
        mediaSessionManager.release()
        super.onDestroy()
    }
} 