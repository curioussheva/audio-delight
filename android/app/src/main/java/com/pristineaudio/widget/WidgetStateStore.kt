package com.pristineaudio.widget

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import java.io.File
import java.io.FileOutputStream

// Satu-satunya tempat state widget disimpan.
//
// Alur: MediaSessionManager memublikasikan state playback (judul/artis/
// isPlaying + posisi/durasi + bitmap artwork hasil decode) ke sini; store
// memutuskan apakah ada yang berubah, menyimpan salinannya (SharedPreferences
// + file PNG kecil di cache), lalu meminta provider menggambar ulang.
// Provider membaca lewat withSnapshot() / withLargeSnapshot().
//
// Kenapa bitmap, bukan URI: RemoteViews jalan di proses launcher (widget
// host). Host tidak bisa membaca file privat app, dan content URI MediaStore
// (content://media/external/audio/albums/…/albumart) belum tentu bisa
// dibaca host tanpa izinnya sendiri. Bitmap hasil decode di proses app
// diparcel ke host lewat setImageViewBitmap — tidak butuh izin apa pun
// dari host.
//
// Kenapa ada persistensi: proses app bisa mati (sistem / battery saver)
// sementara widget tetap terpasang. onUpdate() setelah proses mati harus
// tetap bisa merender state terakhir yang diketahui, bukan widget kosong.
//
// Dua ukuran artwork: widget 4x1 cukup 128px (artwork tampil 48dp), widget
// besar butuh 512px (artwork dominan ~300dp). Keduanya dibuat dari bitmap
// sumber yang sama di replaceArtwork() — satu sumber kebenaran, tidak ada
// jalur update kedua. Posisi TIDAK dipersist (berubah tiap detik saat lagu
// jalan; yang dipersist hanya identitas: judul/artis/isPlaying/durasi).
object WidgetStateStore {

    private const val PREFS_NAME = "pristine_widget"
    private const val KEY_TITLE = "title"
    private const val KEY_ARTIST = "artist"
    private const val KEY_IS_PLAYING = "is_playing"
    private const val KEY_DURATION_MS = "duration_ms"
    private const val ARTWORK_FILE_NAME = "widget_artwork.png"
    private const val ARTWORK_LARGE_FILE_NAME = "widget_artwork_large.png"

    // Artwork widget 4x1 cukup 128px di sisi terpanjang — parcel bitmap ke
    // launcher harus kecil; bitmap metadata 1024px boros IPC + memori host.
    private const val ARTWORK_MAX_DIM = 128

    // Artwork widget besar: 512px di sisi terpanjang. Pada layar ~2.5x
    // (POCO M6) artwork ~300dp butuh ~750px untuk tajam sempurna; 512px
    // adalah kompromi (sedikit lembut, tapi parcel PNG foto album biasanya
    // 100–400 KB — aman di bawah batas binder ~1 MB per transaksi).
    private const val ARTWORK_LARGE_MAX_DIM = 512

    private val lock = Any()

    @Volatile
    private var cachedState: WidgetPlaybackState? = null

    // Salinan milik store (bukan alias bitmap MediaSessionManager): bitmap
    // sumber bisa di-recycle saat track berganti, salinan ini tidak.
    @Volatile
    private var cachedArtwork: Bitmap? = null

    @Volatile
    private var cachedArtworkLarge: Bitmap? = null

    // Publikasikan state baru. updateAll() ke provider hanya dipanggil
    // kalau state berubah atau ada artwork baru — pemanggil yang menembak
    // sering (updatePlaybackState ~1/detik) tidak membanjiri launcher
    // dengan IPC.
    //
    // Kalau state berubah (mis. ganti track) tanpa artwork baru, artwork
    // lama dibuang supaya widget tidak menampilkan cover lagu sebelumnya.
    //
    // Posisi: berubah tiap detik saat lagu jalan — update cache memori +
    // gambar ulang, tapi TIDAK dipersist dan TIDAK membuang artwork.
    fun publish(
        context: Context,
        state: WidgetPlaybackState,
        artwork: Bitmap?,
        artworkChanged: Boolean,
    ) {
        val changed = synchronized(lock) {
            val stateChanged = widgetStateChanged(cachedState, state)
            if (!stateChanged && !artworkChanged) return@synchronized false
            if (widgetIdentityChanged(cachedState, state)) {
                cachedState = state
                persistState(context, state)
                if (artworkChanged) {
                    replaceArtwork(context, artwork)
                } else {
                    clearArtwork(context)
                }
            } else if (artworkChanged) {
                // Artwork saja yang baru (state identik): ganti artwork,
                // tanpa persist ulang dan tanpa membuang apa pun.
                replaceArtwork(context, artwork)
            } else {
                // Hanya posisi yang bergerak: perbarui cache, tanpa
                // persist dan tanpa menyentuh artwork.
                cachedState = state
            }
            true
        }
        if (changed) {
            // DIAGNOSTIK SEMENTARA (2026-11-20): satu baris per update
            // widget yang benar-benar didorong ke launcher (playing,
            // judul, posisi). Dev-only via BuildConfig.DEBUG; ~1 baris/
            // detik saat lagu jalan (posisi bergerak), 0 saat pause.
            // Hapus blok ini bila kebekuan widget sudah terjawab.
            if (com.pristineaudio.app.BuildConfig.DEBUG) {
                android.util.Log.d("WidgetStateStore",
                    "[WIDGET] update playing=${state.isPlaying} track=\"${state.title}\" artist=\"${state.artist}\" pos=${state.positionMs / 1000}s/${state.durationMs / 1000}s art=${artworkChanged}")
            }
            PristineAudioWidgetProvider.updateAll(context)
            PristineAudioWidgetLargeProvider.updateAll(context)
        }
    }

    // Baca snapshot di bawah kunci yang sama dengan publish(): bitmap yang
    // dikembalikan tidak bisa di-recycle di tengah parcel RemoteViews.
    // Block dijalankan selagi kunci dipegang — jangan panggil publish()
    // dari dalam block (deadlock).
    fun <T> withSnapshot(context: Context, block: (WidgetPlaybackState, Bitmap?) -> T): T {
        synchronized(lock) {
            if (cachedState == null) {
                loadPersisted(context)
            }
            return block(cachedState ?: WidgetPlaybackState.EMPTY, cachedArtwork)
        }
    }

    // Snapshot untuk widget besar: state yang sama, artwork 512px.
    fun <T> withLargeSnapshot(context: Context, block: (WidgetPlaybackState, Bitmap?) -> T): T {
        synchronized(lock) {
            if (cachedState == null) {
                loadPersisted(context)
            }
            return block(cachedState ?: WidgetPlaybackState.EMPTY, cachedArtworkLarge)
        }
    }

    private fun persistState(context: Context, state: WidgetPlaybackState) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_TITLE, state.title)
            .putString(KEY_ARTIST, state.artist)
            .putBoolean(KEY_IS_PLAYING, state.isPlaying)
            .putLong(KEY_DURATION_MS, state.durationMs)
            .apply()
    }

    private fun loadPersisted(context: Context) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val title = prefs.getString(KEY_TITLE, null)
        // Belum pernah ada state yang dipublikasikan (widget dipasang
        // sebelum lagu pertama diputar): pakai EMPTY, jangan tampilkan
        // judul sampah.
        if (title == null) {
            cachedState = WidgetPlaybackState.EMPTY
            cachedArtwork = null
            cachedArtworkLarge = null
            return
        }
        cachedState = WidgetPlaybackState(
            title = title,
            artist = prefs.getString(KEY_ARTIST, "").orEmpty(),
            isPlaying = prefs.getBoolean(KEY_IS_PLAYING, false),
            // Posisi tidak dipersist: sesudah proses mati, progress mulai
            // dari 0 sampai watcher posisi berikutnya (<1 detik saat jalan).
            positionMs = 0L,
            durationMs = prefs.getLong(KEY_DURATION_MS, 0L),
        )
        cachedArtwork = loadArtworkFile(context, ARTWORK_FILE_NAME)
        cachedArtworkLarge = loadArtworkFile(context, ARTWORK_LARGE_FILE_NAME)
    }

    private fun artworkFile(context: Context, name: String): File =
        File(context.cacheDir, name)

    private fun replaceArtwork(context: Context, artwork: Bitmap?) {
        val old = cachedArtwork
        val oldLarge = cachedArtworkLarge
        cachedArtwork = null
        cachedArtworkLarge = null
        old?.takeIf { !it.isRecycled }?.recycle()
        oldLarge?.takeIf { !it.isRecycled }?.recycle()
        if (artwork == null || artwork.isRecycled) {
            artworkFile(context, ARTWORK_FILE_NAME).delete()
            artworkFile(context, ARTWORK_LARGE_FILE_NAME).delete()
            return
        }
        // Downscale + salin: salinan ini milik store, sumbernya bebas
        // di-recycle MediaSessionManager kapan pun.
        val owned = ownDownscaledCopy(artwork, ARTWORK_MAX_DIM)
        cachedArtwork = owned
        val ownedLarge = ownDownscaledCopy(artwork, ARTWORK_LARGE_MAX_DIM)
        cachedArtworkLarge = ownedLarge
        try {
            FileOutputStream(artworkFile(context, ARTWORK_FILE_NAME)).use { out ->
                owned.compress(Bitmap.CompressFormat.PNG, 100, out)
            }
            FileOutputStream(artworkFile(context, ARTWORK_LARGE_FILE_NAME)).use { out ->
                ownedLarge.compress(Bitmap.CompressFormat.PNG, 100, out)
            }
        } catch (e: Exception) {
            android.util.Log.w("WidgetStateStore", "simpan artwork widget: ${e.message}")
        }
    }

    private fun clearArtwork(context: Context) {
        val old = cachedArtwork
        val oldLarge = cachedArtworkLarge
        cachedArtwork = null
        cachedArtworkLarge = null
        old?.takeIf { !it.isRecycled }?.recycle()
        oldLarge?.takeIf { !it.isRecycled }?.recycle()
        artworkFile(context, ARTWORK_FILE_NAME).delete()
        artworkFile(context, ARTWORK_LARGE_FILE_NAME).delete()
    }

    private fun loadArtworkFile(context: Context, name: String): Bitmap? {
        val file = artworkFile(context, name)
        if (!file.exists()) return null
        return try {
            BitmapFactory.decodeFile(file.absolutePath)
        } catch (e: Exception) {
            android.util.Log.w("WidgetStateStore", "baca artwork widget: ${e.message}")
            null
        }
    }

    private fun ownDownscaledCopy(src: Bitmap, maxDim: Int): Bitmap {
        val maxSide = maxOf(src.width, src.height).coerceAtLeast(1)
        val targetWidth: Int
        val targetHeight: Int
        if (maxSide <= maxDim) {
            targetWidth = src.width
            targetHeight = src.height
        } else {
            val scale = maxDim.toFloat() / maxSide
            targetWidth = (src.width * scale).toInt().coerceAtLeast(1)
            targetHeight = (src.height * scale).toInt().coerceAtLeast(1)
        }
        // createScaledBitmap bisa mengembalikan src yang sama kalau ukuran
        // tidak berubah — copy() memaksa salinan milik store.
        val scaled = Bitmap.createScaledBitmap(src, targetWidth, targetHeight, true)
        if (scaled !== src) return scaled
        return scaled.copy(Bitmap.Config.ARGB_8888, false) ?: scaled
    }
}
