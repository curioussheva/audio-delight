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
        // Android 14+ (API 34) mewajibkan type eksplisit saat startForeground.
        // Tanpa type, sistem melempar MissingForegroundServiceTypeException
        // dan service langsung dimatikan - notification tidak pernah muncul.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            service.startForeground(
                NOTIFICATION_ID,
                notification,
                android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
            )
        } else {
            service.startForeground(NOTIFICATION_ID, notification)
        }

        // Aktifkan MediaSession supaya sistem mengenali ini sesi media.
        // Tanpa isActive = true, MediaStyle tidak diikat ke sesi dan
        // notification bisa tidak tampil sebagai kontrol media di lock screen.
        mediaSession.isActive = true

        android.util.Log.d("MediaSessionManager", "startForeground OK")
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

    // internal, bukan private: PlaybackService memakainya untuk menyegarkan
    // notifikasi saat service di-start ulang oleh sistem (START_STICKY).
    fun refreshNotification() {
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
            // setOngoing(true) = tidak bisa di-swipe. Wajib untuk kontrol media:
            // kalau bisa di-swipe, user kehilangan kontrol dan sistem
            // menganggap sesi sudah selesai.
            .setOngoing(true)
            // Prioritas rendah supaya tidak berisik, tapi tetap ada.
            .setPriority(NotificationCompat.PRIORITY_LOW)
            // Tampil di lock screen.
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            // Ikon kecil wajib ada dan tidak boleh 0; kalau ikon tidak valid,
            // di beberapa ROM notification GAGAL tampil tanpa error jelas.
            .setShowWhen(false)
            // Tap notification membuka aplikasi.
            .setContentIntent(activityPendingIntent())
            .setStyle(
                MediaStyle()
                    .setMediaSession(mediaSession.sessionToken)
                    .setShowActionsInCompactView(0, 1, 2)
            )

        // Android 12+: tandai bahwa notification ini milik foreground service.
        // Tanpa ini, di sebagian ROM notification tidak muncul atau hilang
        // saat service di-start ulang.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            builder.setForegroundServiceBehavior(
                NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE
            )
        }

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

    // Tap notification -> buka MainActivity (bukan bikin instance baru).
    private fun activityPendingIntent(): PendingIntent {
        val launch = context.packageManager
            .getLaunchIntentForPackage(context.packageName)
            ?.apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP
            }

        // Kalau launch intent tidak tersedia (kasus langka), ambil MainActivity
        // secara eksplisit supaya tap notification tidak jadi no-op.
        val intent = launch ?: Intent().apply {
            setClassName(context.packageName, "com.pristineaudio.app.MainActivity")
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }

        return PendingIntent.getActivity(
            context,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }
} 