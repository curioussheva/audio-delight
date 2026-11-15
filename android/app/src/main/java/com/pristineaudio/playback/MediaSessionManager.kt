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
    private var lastArtwork: android.graphics.Bitmap? = null

    // Turunan 256px dari lastArtwork untuk setLargeIcon notifikasi — dibuat
    // sekali saat artwork selesai di-decode, bukan di-scale ulang tiap
    // buildNotification(). Dibersihkan bersama lastArtwork.
    private var lastArtworkIcon: android.graphics.Bitmap? = null

    // Executor untuk decode artwork (IO + bitmap decode butuh background thread).
    // Single-threaded: decode artwork tidak butuh paralel, dan urutan tetap.
    private val artworkExecutor = java.util.concurrent.Executors.newSingleThreadExecutor()

    // Nomor permintaan artwork terakhir. Dinaikkan tiap updateMetadata();
    // task decode yang selesai dengan id lama (track sudah berganti) membuang
    // hasilnya supaya artwork track lama tidak menimpa track baru.
    // Executor single-thread FIFO, jadi urutan selesai tetap berurutan —
    // yang dijaga di sini adalah staleness, bukan out-of-order completion.
    private val artworkRequestId = java.util.concurrent.atomic.AtomicInteger(0)

    // true setelah release() pertama; release() kedua jadi no-op.
    @Volatile
    private var released = false

    // Artwork di-decode sekali pada ukuran metadata (1024px), lalu ikon
    // notifikasi 256px diturunkan dari bitmap itu tanpa baca ulang disk.
    // Dua ukuran karena dua pemakaian: METADATA_KEY_ART tampil besar di
    // lock screen (320px terlalu kecil/blur), sedangkan setLargeIcon
    // notifikasi cukup 256px — bitmap 1024px di sana boros memory.
    // Full-res album art bisa ribuan px — boros memory dan lambat.
    private val ARTWORK_METADATA_MAX_DIM = 1024
    private val ARTWORK_LARGE_ICON_MAX_DIM = 256

    private val sessionCallback = object : MediaSessionCompat.Callback() {
        override fun onPlay() {
            // 🔥 FIX (2026-10-10): tombol play dari notification/lock screen
            // harus update UI JS, tidak cuma native. Sebelumnya hanya
            // PlaybackNativeBridge.play() — UI React tetap nunjukin "paused"
            // sampai polling 500ms berikutnya, dan syncFromNative tidak
            // dipanggil sama sekali.
            PlaybackNativeBridge.play()
            notifyPlaybackStateChanged()
        }

        override fun onPause() {
            // 🔥 FIX (2026-10-10): sama — pause dari notif harus sync ke JS.
            PlaybackNativeBridge.pause()
            notifyPlaybackStateChanged()
        }

        override fun onSkipToNext() {
            // Tombol next di notification / lock screen TIDAK lewat React.
            // Bridge emit event ke JS supaya UI langsung update tanpa polling.
            PlaybackNativeBridge.next()
            notifyQueueChanged()
        }

        override fun onSkipToPrevious() {
            PlaybackNativeBridge.previous()
            notifyQueueChanged()
        }

        override fun onSeekTo(pos: Long) {
            PlaybackNativeBridge.seek(pos)
            notifyPlaybackStateChanged()
        }

        override fun onStop() {
            PlaybackNativeBridge.stop()
            notifyPlaybackStateChanged()
        }

        // B17-S-d: lock screen / Android Auto repeat/shuffle selama ini
        // no-op — ACTION_SET_REPEAT_MODE / ACTION_SET_SHUFFLE_MODE sudah
        // dideklarasikan di playbackStateBuilder tapi callback-nya tidak
        // pernah di-override. Mapping ke kontrak native mirror
        // updateRepeatMode/updateShuffleMode (koreksi 2026-11-11):
        // repeat 0=off, 1=track (ONE), 2=all; shuffle true=ALL.
        // CATATAN: tidak ada event bridge native→JS untuk perubahan
        // repeat/shuffle dari lock screen — JS re-sync lewat jalurnya
        // sendiri (track-change / polling). Event baru sengaja TIDAK
        // dibuat di commit ini.
        override fun onSetRepeatMode(repeatMode: Int) {
            val mode = when (repeatMode) {
                PlaybackStateCompat.REPEAT_MODE_ONE -> 1
                PlaybackStateCompat.REPEAT_MODE_ALL -> 2
                else -> 0
            }
            PlaybackNativeBridge.setRepeatMode(mode)
            updateRepeatMode(mode)
        }

        override fun onSetShuffleMode(shuffleMode: Int) {
            val enabled = shuffleMode == PlaybackStateCompat.SHUFFLE_MODE_ALL
            PlaybackNativeBridge.setShuffle(enabled)
            updateShuffleMode(enabled)
        }
    }

    // Beri tahu JS kalau trek berganti dari sisi native (notification/lock
    // screen). Native advance sudah update queue + load track baru; JS perlu
    // sync supaya UI React tidak menampilkan lagu lama.
    //
    // Dulu ini cuma refreshNotification() (gambar ulang notifikasi doang),
    // namanya menyesatkan. Sekarang juga emit event ke JS lewat bridge.
    // 🔥 FIX (2026-10-10): play/pause/seek/stop dari notification/lock screen
    // juga harus sync ke JS — tidak cuma ganti trek. emitPlaybackStateChanged
    // kasih tahu React supaya tombol UI langsung berubah, tanpa nunggu
    // polling 500ms yang bisa terlihat telat.
    private fun notifyPlaybackStateChanged() {
        try {
            val isPlaying = PlaybackNativeBridge.isPlaying()
            PlaybackNativeBridge.emitPlaybackStateChanged(isPlaying)
            refreshNotification()
        } catch (e: Exception) {
            android.util.Log.w("MediaSessionManager", "notifyPlaybackStateChanged: ${e.message}")
        }
    }

    private fun notifyQueueChanged() {
        try {
            val cur = PlaybackNativeBridge.getCurrentTrack()
            val index = PlaybackNativeBridge.getCurrentIndex()
            if (!cur.isNullOrEmpty()) {
                // Emit ke JS: UI React langsung segarkan.
                PlaybackNativeBridge.emitTrackChanged(cur, index)
            }
            // Notifikasi tetap di-refresh supaya tombol play/pause benar.
            refreshNotification()
        } catch (e: Exception) {
            android.util.Log.w("MediaSessionManager", "notifyQueueChanged: ${e.message}")
        }
    }

    private val mediaSession: MediaSessionCompat =
        MediaSessionCompat(context, "PristineAudio").apply {
            // B16-M1: callback MediaSession jalan di command thread, BUKAN
            // main looper — callback memanggil bridge yang berakhir di JNI
            // loadTrack sinkron (risiko ANR kalau di main thread).
            // Yang dipanggil callback di sini aman di thread ini:
            // NotificationManager.notify dan MediaSessionCompat
            // (setPlaybackState/setMetadata) thread-safe; emit event ke JS
            // lewat RCTDeviceEventEmitter diantrekan ke JS thread oleh
            // bridge; refresh artwork sudah mem-post ke main looper.
            setCallback(sessionCallback, service.commandHandler)
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
                PlaybackStateCompat.ACTION_SEEK_TO or
                PlaybackStateCompat.ACTION_SET_REPEAT_MODE or
                PlaybackStateCompat.ACTION_SET_SHUFFLE_MODE
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
        if (released) return
        released = true
        mediaSession.isActive = false
        mediaSession.release()
        // Thread executor non-daemon: tanpa shutdown, thread-nya bocor
        // tiap siklus service. shutdownNow aman dipanggil ulang, tapi
        // guard released di atas sudah membuat release() kedua jadi no-op.
        artworkExecutor.shutdownNow()
    }

    // 🔥 NEW: update metadata (judul, artist, durasi) + refresh notifikasi
    // Artwork: URI gambar (content:// album art, atau path file). Dibaca di
    // background (IO disk) supaya tidak memblokir thread yang panggil ini.
    fun updateMetadata(
        title: String,
        artist: String,
        album: String,
        durationMs: Long,
        artworkUri: String?,
    ) {
        lastTitle = title
        lastArtist = artist

        // Track baru belum tentu punya artwork: bersihkan artwork track lama
        // supaya tidak tampil di notifikasi/lock screen track ini. Metadata
        // yang dibangun di bawah tidak membawa bitmap, dan buildNotification()
        // sudah skip setLargeIcon saat lastArtwork null.
        // Ikon 256px dibersihkan bersama bitmap metadata-nya.
        lastArtwork = null
        lastArtworkIcon = null

        // Naikkan id permintaan; task decode membawa id ini + nilai
        // title/artist/album/duration yang DITANGKAP saat submit (parameter
        // fungsi, bukan field mutable lastTitle/lastArtist yang bisa berubah
        // sebelum task dieksekusi).
        val requestId = artworkRequestId.incrementAndGet()

        val metadata = MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
            .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, album)
            .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, durationMs)
            .build()

        mediaSession.setMetadata(metadata)
        mediaSession.isActive = true

        // Artwork di-update terpisah: decode bitmap butuh IO.
        // Skip kalau service sudah release (executor sudah shutdown —
        // execute() akan melempar RejectedExecutionException).
        if (!released && !artworkUri.isNullOrEmpty()) {
            artworkExecutor.execute {
                loadArtwork(artworkUri, requestId, title, artist, album, durationMs)
            }
        }

        refreshNotification()
    }

    // 🔥 NEW: update playback state (playing/paused, posisi) untuk slider lock screen
    fun updatePlaybackState(isPlaying: Boolean, positionMs: Long) {
        lastIsPlaying = isPlaying
        applyPlaybackState(isPlaying, positionMs)
    }

    // 🔥 NEW: shuffle/repeat di MediaSession supaya lock screen ikut.
    // repeat mode: 0=off, 1=track (One), 2=all (sesuai mapping JS di
    // playerStore + enum C++ PlaybackTypes.h). KOREKSI 2026-11-11 (J-M1):
    // peta lama (1=all, 2=track) TERBALIK terhadap native.
    //
    // CATATAN: setShuffleMode/setRepeatMode ada di MediaSessionCompat, BUKAN di
    // PlaybackStateCompat.Builder (Builder hanya punya setActions, setState,
    // setBufferedPosition, setExtras, dll). Builder tidak punya method ini,
    // jadi panggil di mediaSession — itu juga yang mengupdate state yang
    // terlihat di lock screen / Bluetooth / Android Auto.
    fun updateShuffleMode(enabled: Boolean) {
        mediaSession.setShuffleMode(
            if (enabled) PlaybackStateCompat.SHUFFLE_MODE_ALL
            else PlaybackStateCompat.SHUFFLE_MODE_NONE
        )
        refreshNotification()
    }

    fun updateRepeatMode(mode: Int) {
        val repeatMode = when (mode) {
            1 -> PlaybackStateCompat.REPEAT_MODE_ONE
            2 -> PlaybackStateCompat.REPEAT_MODE_ALL
            else -> PlaybackStateCompat.REPEAT_MODE_NONE
        }
        mediaSession.setRepeatMode(repeatMode)
        refreshNotification()
    }

    private fun applyPlaybackState(isPlaying: Boolean, positionMs: Long) {
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

    // ============================================================
    // 🔥 ARTWORK
    // ============================================================

    // Decode bitmap dari content:// (MediaStore album art) atau path file.
    // Dijalankan di artworkExecutor (background). Hasilnya dipakai untuk
    // METADATA_KEY_ART (lock screen background) + setLargeIcon (notification).
    //
    // title/artist/album/durationMs DITANGKAP saat submit di updateMetadata(),
    // bukan dibaca dari field mutable lastTitle/lastArtist di sini — field
    // itu sudah bisa berubah ke track berikutnya saat task ini dieksekusi.
    // requestId yang sudah tidak cocok dengan artworkRequestId berarti track
    // sudah berganti: hasil decode dibuang, metadata tidak disentuh.
    private fun loadArtwork(
        uri: String,
        requestId: Int,
        title: String,
        artist: String,
        album: String,
        durationMs: Long,
    ) {
        try {
            // Decode sekali pada ukuran metadata (1024px); ikon notifikasi
            // diturunkan dari bitmap ini, tanpa baca ulang disk.
            val bmp = decodeBitmapSafely(uri, ARTWORK_METADATA_MAX_DIM)
            if (bmp != null) {
                if (requestId != artworkRequestId.get()) {
                    // Stale: track sudah berganti selagi decode berjalan.
                    // Bitmap belum pernah dipublikasikan, aman di-recycle.
                    bmp.recycle()
                    return
                }
                lastArtwork = bmp
                lastArtworkIcon = downscaleToMaxDim(bmp, ARTWORK_LARGE_ICON_MAX_DIM)

                // Update metadata dengan artwork. putBitmap butuh ukuran
                // yang wajar — biarkan sistem menangani scaling.
                // Metadata dibangun dari nilai yang ditangkap saat submit,
                // bukan dari field mutable atau metadata lama.
                val metadata = MediaMetadataCompat.Builder()
                    .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
                    .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
                    .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, album)
                    .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, durationMs)
                    .putBitmap(MediaMetadataCompat.METADATA_KEY_ART, bmp)
                    .build()

                mediaSession.setMetadata(metadata)

                // Refresh notifikasi di main thread (notifikasi + UI lockscreen).
                android.os.Handler(android.os.Looper.getMainLooper()).post {
                    try {
                        refreshNotification()
                    } catch (e: Exception) {
                        android.util.Log.w("MediaSessionManager", "refresh setelah artwork: ${e.message}")
                    }
                }
            }
        } catch (e: Exception) {
            android.util.Log.w("MediaSessionManager", "loadArtwork($uri): ${e.message}")
        }
    }

    // Downscale bitmap ke sisi terpanjang <= maxDim, jaga aspect ratio.
    // Kalau sudah cukup kecil, kembalikan bitmap yang sama (tanpa salinan).
    private fun downscaleToMaxDim(
        src: android.graphics.Bitmap,
        maxDim: Int,
    ): android.graphics.Bitmap {
        val maxSide = maxOf(src.width, src.height)
        if (maxSide <= maxDim) return src
        val scale = maxDim.toFloat() / maxSide
        return android.graphics.Bitmap.createScaledBitmap(
            src,
            (src.width * scale).toInt().coerceAtLeast(1),
            (src.height * scale).toInt().coerceAtLeast(1),
            true,
        )
    }

    // Decode + downscale. Bitmap full-res dari album art bisa 4000x4000;
    // ukuran maksimum sisi terpanjang diatur pemanggil lewat maxDim.
    private fun decodeBitmapSafely(uri: String, maxDim: Int): android.graphics.Bitmap? {
        return try {
            val resolver = context.contentResolver
            val opts = android.graphics.BitmapFactory.Options().apply {
                inJustDecodeBounds = true
            }

            // Coba content:// dulu, fallback ke path file.
            try {
                resolver.openInputStream(android.net.Uri.parse(uri))?.use { input ->
                    android.graphics.BitmapFactory.decodeStream(input, null, opts)
                }
            } catch (e: Exception) {
                // Bukan content URI → coba path file langsung
                android.graphics.BitmapFactory.decodeFile(uri, opts)
            }

            if (opts.outWidth <= 0 || opts.outHeight <= 0) return null

            // Hitung sample size supaya sisi terpanjang <= maxDim.
            val maxDimSide = maxOf(opts.outWidth, opts.outHeight)
            var sampleSize = 1
            while (maxDimSide / sampleSize > maxDim) {
                sampleSize *= 2
            }

            val decodeOpts = android.graphics.BitmapFactory.Options().apply {
                inSampleSize = sampleSize
            }

            val bmp = try {
                resolver.openInputStream(android.net.Uri.parse(uri))?.use { input ->
                    android.graphics.BitmapFactory.decodeStream(input, null, decodeOpts)
                }
            } catch (e: Exception) {
                android.graphics.BitmapFactory.decodeFile(uri, decodeOpts)
            }

            bmp
        } catch (e: Exception) {
            android.util.Log.w("MediaSessionManager", "decodeBitmapSafely: ${e.message}")
            null
        }
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

        // 🔥 Artwork: gambar album di notifikasi (large icon) + lock screen.
        // lastArtwork di-set async oleh loadArtwork; null = belum ada artwork.
        // Large icon memakai turunan 256px yang di-cache (lastArtworkIcon),
        // bukan bitmap metadata 1024px — dan tidak di-scale ulang tiap refresh.
        lastArtworkIcon?.let { icon ->
            builder.setLargeIcon(icon)
        }

        builder.setStyle(
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