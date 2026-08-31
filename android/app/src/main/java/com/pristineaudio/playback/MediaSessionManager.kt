package com.pristineaudio.playback

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.core.app.NotificationCompat
import androidx.media.app.NotificationCompat.MediaStyle

class MediaSessionManager(private val service: PlaybackService) {

    companion object {
        const val CHANNEL_ID = "pristine_playback"
        const val NOTIFICATION_ID = 1001
    }

    private val context: Context = service

    private val mediaSession: MediaSessionCompat =
        MediaSessionCompat(context, "PristineAudio").apply {
            setCallback(sessionCallback)
            setFlags(
                MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS or
                    MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS
            )
        }

    private val playbackStateBuilder = PlaybackStateCompat.Builder()
        .setActions(
            PlaybackStateCompat.ACTION_PLAY or
                PlaybackStateCompat.ACTION_PAUSE or
                PlaybackStateCompat.ACTION_PLAY_PAUSE or
                PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
                PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or
                PlaybackStateCompat.ACTION_SEEK_TO
        )

    private val sessionCallback = object : MediaSessionCompat.Callback() {
        override fun onPlay() {
            PlaybackNativeBridge.play()
        }

        override fun onPause() {
            PlaybackNativeBridge.pause()
        }

        override fun onSkipToNext() {
            PlaybackNativeBridge.next()
        }

        override fun onSkipToPrevious() {
            PlaybackNativeBridge.previous()
        }

        override fun onSeekTo(pos: Long) {
            // pos dalam ms, kirim langsung ke bridge
            PlaybackNativeBridge.seek(pos)
        }

        override fun onStop() {
            PlaybackNativeBridge.stop()
        }
    }

    fun startForeground() {
        createNotificationChannel()
        val notification = buildNotification()
        service.startForeground(NOTIFICATION_ID, notification)
    }

    fun release() {
        mediaSession.isActive = false
        mediaSession.release()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "PristineAudio Playback",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Media playback controls"
                setShowBadge(false)
            }
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification {
        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle("PristineAudio")
            .setContentText("Playing...")
            .setOngoing(true)
            .setStyle(
                MediaStyle()
                    .setMediaSession(mediaSession.sessionToken)
                    .setShowActionsInCompactView(0, 1, 2)
            )

        // Tambahkan tombol aksi dengan PendingIntent
        builder.addAction(
            android.R.drawable.ic_media_previous,
            "Previous",
            pendingIntentForAction(PlaybackService.ACTION_PREVIOUS)
        )
        builder.addAction(
            android.R.drawable.ic_media_play,
            "Play",
            pendingIntentForAction(PlaybackService.ACTION_PLAY)
        )
        builder.addAction(
            android.R.drawable.ic_media_next,
            "Next",
            pendingIntentForAction(PlaybackService.ACTION_NEXT)
        )

        return builder.build()
    }

    private fun pendingIntentForAction(action: String): PendingIntent {
        val intent = Intent(context, PlaybackService::class.java).apply {
            this.action = action
        }
        return PendingIntent.getService(
            context,
            action.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT
        )
    }
} 