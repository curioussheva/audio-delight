package com.pristineaudio.playback

import android.app.Service
import android.content.Intent
import android.os.Handler
import android.os.HandlerThread
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

    // B16-M1: thread perintah kontrol media. Play/pause/next/prev/seek dan
    // callback MediaSession TIDAK BOLEH jalan di main thread — rantai bridge
    // berakhir di JNI loadTrack yang sinkron di bawah loadTrackMutex_
    // (FFmpeg open; fallback content:// menyalin seluruh file), risiko ANR.
    // Satu thread serial: perintah dieksekusi berurutan, tanpa balapan antar
    // perintah (mis. play lalu seek langsung).
    private lateinit var commandThread: HandlerThread
    lateinit var commandHandler: Handler
        private set

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
        // Thread perintah harus hidup SEBELUM MediaSessionManager dibuat:
        // MediaSessionManager memakai commandHandler untuk setCallback.
        commandThread = HandlerThread("pristine-playback-cmd").apply { start() }
        commandHandler = Handler(commandThread.looper)
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
        // B16-P2: service mengembalikan START_STICKY, jadi setelah proses
        // dimatikan sistem me-restart service dengan intent null. Tanpa
        // guard ini, restart itu menjalankan startForeground() +
        // acquireWakeLock() padahal tidak ada antrean/engine — notifikasi
        // hantu (tombol Play dengan default idle). Matikan sebelum apa pun.
        if (intent == null) { stopSelf(); return START_NOT_STICKY }
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

        // Perintah kontrol media jalan di command thread (B16-M1), bukan
        // main thread — startForeground/refreshNotification di atas tetap
        // di main thread, itu bagian lifecycle service.
        when (intent?.action) {
            ACTION_PLAY -> commandHandler.post { PlaybackNativeBridge.play() }
            ACTION_PAUSE -> commandHandler.post { PlaybackNativeBridge.pause() }
            ACTION_NEXT -> commandHandler.post { PlaybackNativeBridge.next() }
            ACTION_PREVIOUS -> commandHandler.post { PlaybackNativeBridge.previous() }
            ACTION_SEEK -> {
                val pos = intent.getLongExtra(EXTRA_SEEK_POSITION, 0L)
                commandHandler.post { PlaybackNativeBridge.seek(pos) }
            }
            ACTION_STOP -> {
                // STOP SINKRON, sengaja TIDAK di-post ke commandHandler (B16-M1).
                // Kalau stop di-post lalu stopSelf() dipanggil langsung, ada
                // jendela di mana service sudah mati tapi audio masih jalan
                // (stop belum sempat dieksekusi). stop() sendiri murah — tidak
                // membuka FFmpeg, hanya mengambil loadTrackMutex_ sebentar —
                // jadi aman dijalankan di thread pemanggil (main thread).
                // Perintah yang sudah terlanjur antre di commandHandler
                // dibuang, supaya play/seek yang datang sesaat sebelum STOP
                // tidak menghidupkan lagi audio setelah engine berhenti.
                PlaybackNativeBridge.stop()
                commandHandler.removeCallbacksAndMessages(null)
                releaseWakeLock()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
        }

        return START_STICKY
    }

    fun updateMetadata(
        title: String,
        artist: String,
        album: String,
        durationMs: Long,
        artworkUri: String?,
    ) {
        mediaSessionManager.updateMetadata(title, artist, album, durationMs, artworkUri)
    }

    fun updatePlaybackState(isPlaying: Boolean, positionMs: Long) {
        mediaSessionManager.updatePlaybackState(isPlaying, positionMs)
    }

    fun updateShuffleMode(enabled: Boolean) {
        mediaSessionManager.updateShuffleMode(enabled)
    }

    fun updateRepeatMode(mode: Int) {
        mediaSessionManager.updateRepeatMode(mode)
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
        // Buang perintah yang masih antre supaya tidak ada play/seek yang
        // jalan setelah service mati, lalu matikan thread perintah.
        // CATATAN (B16-M1): sengaja TIDAK ada engine-stop di sini — itu
        // temuan W2, dikerjakan terpisah.
        if (::commandHandler.isInitialized) {
            commandHandler.removeCallbacksAndMessages(null)
        }
        if (::commandThread.isInitialized) {
            commandThread.quitSafely()
        }
        releaseWakeLock()
        mediaSessionManager.release()
        if (instance == this) instance = null
        isForegroundStarted = false
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
