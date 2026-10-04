package com.pristineaudio.playback

import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.os.PowerManager

class PlaybackService : Service() {

    companion object {
        const val ACTION_PLAY = "com.pristineaudio.playback.PLAY"
        const val ACTION_PAUSE = "com.pristineaudio.playback.PAUSE"
        const val ACTION_NEXT = "com.pristineaudio.playback.NEXT"
        const val ACTION_PREVIOUS = "com.pristineaudio.playback.PREVIOUS"
        const val ACTION_SEEK = "com.pristineaudio.playback.SEEK"
        const val ACTION_STOP = "com.pristineaudio.playback.STOP"
        const val EXTRA_SEEK_POSITION = "extra_seek_position"

        private const val WAKE_LOCK_TAG = "PristineAudio::PlaybackWakeLock"

        @Volatile
        var instance: PlaybackService? = null
    }

    private lateinit var mediaSessionManager: MediaSessionManager

    // Wake lock parsial: menahan CPU tetap hidup saat layar mati.
    //
    // Tanpa ini, audio bisa putus saat layar mati / device masuk doze, karena
    // CPU di-suspend dan thread dekoder tidak dijadwalkan. Foreground service
    // saja TIDAK cukup - ia menaikkan prioritas proses tapi tidak menahan CPU.
    //
    // PARTIAL_WAKE_LOCK (bukan SCREEN_DIM/SCREEN_BRIGHT) supaya layar tetap
    // bisa mati seperti biasa dan baterai tidak terkuras oleh layar.
    //
    // Dilepas HANYA saat playback benar-benar berhenti, bukan saat pause -
    // pause biasanya berlanjut, dan melepas/mengambil lock berulang boros.
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onCreate() {
        super.onCreate()
        mediaSessionManager = MediaSessionManager(this)
        instance = this
        acquireWakeLock()
    }

    private fun acquireWakeLock() {
        if (wakeLock?.isHeld == true) return
        try {
            val pm = getSystemService(POWER_SERVICE) as PowerManager
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, WAKE_LOCK_TAG).apply {
                setReferenceCounted(false)
                acquire()
            }
            android.util.Log.d("PlaybackService", "WakeLock acquired")
        } catch (e: Exception) {
            android.util.Log.e("PlaybackService", "WakeLock gagal diambil", e)
        }
    }

    private fun releaseWakeLock() {
        try {
            // isHeld bisa melempar kalau lock sudah dilepas; exception dibiarkan
            // lewat supaya tidak mematikan service.
            if (wakeLock?.isHeld == true) {
                wakeLock?.release()
                android.util.Log.d("PlaybackService", "WakeLock released")
            }
        } catch (e: Exception) {
            android.util.Log.w("PlaybackService", "WakeLock release: ${e.message}")
        } finally {
            wakeLock = null
        }
    }

    private var isForegroundStarted = false

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // startForeground() dipanggil SETIAP kali service di-start ulang oleh
        // sistem, bukan hanya sekali. Setelah proses dimatikan dan di-restart
        // dengan START_STICKY, service WAJIB memanggil startForeground() lagi
        // dalam hitungan detik - kalau tidak, sistem melempar
        // ForegroundServiceDidNotStartInTimeException dan mematikan service.
        // Flag isForegroundStarted hanya mencegah pemanggilan berulang dalam
        // satu siklus hidup yang sama.
        if (!isForegroundStarted) {
            mediaSessionManager.startForeground()
            isForegroundStarted = true
            acquireWakeLock()
        } else {
            // Sudah foreground: cukup segarkan notifikasi supaya sistem tahu
            // service ini masih aktif.
            mediaSessionManager.refreshNotification()
        }

        when (intent?.action) {
            ACTION_PLAY -> PlaybackNativeBridge.play()
            ACTION_PAUSE -> PlaybackNativeBridge.pause()
            ACTION_NEXT -> PlaybackNativeBridge.next()
            ACTION_PREVIOUS -> PlaybackNativeBridge.previous()
            ACTION_SEEK -> {
                val pos = intent.getLongExtra(EXTRA_SEEK_POSITION, 0L)
                PlaybackNativeBridge.seek(pos)
            }
            ACTION_STOP -> {
                // Berhenti total: lepas wake lock dan keluarkan dari foreground.
                releaseWakeLock()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
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

    override fun onTaskRemoved(rootIntent: Intent?) {
        // Jangan stop service saat user swipe app dari recents.
        // Wake lock ditahan supaya audio tidak putus setelah swipe.
        android.util.Log.d("PlaybackService", "onTaskRemoved - service tetap jalan")
        super.onTaskRemoved(rootIntent)
    }

    // Dipanggil sistem saat proses aplikasi dimatikan paksa (low memory,
    // battery optimization). Wake lock harus dilepas supaya tidak jadi
    // referensi yang menggantung.
    override fun onDestroy() {
        releaseWakeLock()
        mediaSessionManager.release()
        if (instance == this) instance = null
        isForegroundStarted = false
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
