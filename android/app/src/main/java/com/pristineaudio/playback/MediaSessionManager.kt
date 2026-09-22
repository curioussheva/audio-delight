package com.pristineaudio.playback

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.support.v4.media.MediaMetadataCompat
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

    private var lastTitle: String = "PristineAudio"
    private var lastArtist: String = "Playing..."
    private var lastIsPlaying: Boolean = false

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
            PlaybackNativeBridge.seek(pos)
        }

        override fun onStop() {
            PlaybackNativeBridge.stop()
        }
    }

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

    fun startForeground() {
        createNotificationChannel()
        val notification = buildNotification()
        service.startForeground(NOTIFICATION_ID, notification)
    }

    fun release() {
        mediaSession.isActive = false
        mediaSession.release()
    }

    // 🔥 NEW: update metadata (judul, artist, durasi) + refresh notifikasi
    fun updateMetadata(title: String, artist: String, album: String, durationMs: Long) {
        lastTitle = title
        lastArtist = artist

        val metadata = MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
            .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, album)
            .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, durationMs)
            .build()

        mediaSession.setMetadata(metadata)
        mediaSession.isActive = true

        refreshNotification()
    }

    // 🔥 NEW: update playback state (playing/paused, posisi) untuk slider lock screen
    fun updatePlaybackState(isPlaying: Boolean, positionMs: Long) {
        lastIsPlaying = isPlaying
        val state = playbackStateBuilder
            .setState(
                if (isPlaying) PlaybackStateCompat.STATE_PLAYING
                else PlaybackStateCompat.STATE_PAUSED,
                positionMs,
                1.0f
            )
            .build()

        mediaSession.setPlaybackState(state)
    }

    private fun refreshNotification() {
        val notification = buildNotification()
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(NOTIFICATION_ID, notification)
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
            .setContentTitle(lastTitle)
            .setContentText(lastArtist)
            .setOngoing(true)
            .setStyle(
                MediaStyle()
                    .setMediaSession(mediaSession.sessionToken)
                    .setShowActionsInCompactView(0, 1, 2)
            )

        builder.addAction(
            android.R.drawable.ic_media_previous,
            "Previous",
            pendingIntentForAction(PlaybackService.ACTION_PREVIOUS)
        )
        // 🔥 FIX: tombol Play/Pause dynamic
        if (lastIsPlaying) {
            builder.addAction(
                android.R.drawable.ic_media_pause,
                "Pause",
                pendingIntentForAction(PlaybackService.ACTION_PAUSE)
            )
        } else {
            builder.addAction(
                android.R.drawable.ic_media_play,
                "Play",
                pendingIntentForAction(PlaybackService.ACTION_PLAY)
            )
        }
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
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }
} 