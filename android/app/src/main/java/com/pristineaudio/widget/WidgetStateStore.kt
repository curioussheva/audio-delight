package com.pristineaudio.widget

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import java.io.File
import java.io.FileOutputStream

// Satu-satunya tempat state widget disimpan.
//
// Alur: MediaSessionManager memublikasikan state playback (judul/artis/
// isPlaying + bitmap artwork hasil decode) ke sini; store memutuskan
// apakah ada yang berubah, menyimpan salinannya (SharedPreferences +
// file PNG kecil di cache), lalu meminta provider menggambar ulang.
// Provider membaca lewat withSnapshot().
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
object WidgetStateStore {

    private const val PREFS_NAME = "pristine_widget"
    private const val KEY_TITLE = "title"
    private const val KEY_ARTIST = "artist"
    private const val KEY_IS_PLAYING = "is_playing"
    private const val ARTWORK_FILE_NAME = "widget_artwork.png"

    // Artwork widget cukup 128px di sisi terpanjang — parcel bitmap ke
    // launcher harus kecil; bitmap metadata 1024px boros IPC + memori host.
    private const val ARTWORK_MAX_DIM = 128

    private val lock = Any()

    @Volatile
    private var cachedState: WidgetPlaybackState? = null

    // Salinan milik store (bukan alias bitmap MediaSessionManager): bitmap
    // sumber bisa di-recycle saat track berganti, salinan ini tidak.
    @Volatile
    private var cachedArtwork: Bitmap? = null

    // Publikasikan state baru. updateAll() ke provider hanya dipanggil
    // kalau state berubah atau ada artwork baru — pemanggil yang menembak
    // sering (updatePlaybackState ~1/detik) tidak membanjiri launcher
    // dengan IPC.
    //
    // Kalau state berubah (mis. ganti track) tanpa artwork baru, artwork
    // lama dibuang supaya widget tidak menampilkan cover lagu sebelumnya.
    fun publish(
        context: Context,
        state: WidgetPlaybackState,
        artwork: Bitmap?,
        artworkChanged: Boolean,
    ) {
        val changed = synchronized(lock) {
            val stateChanged = widgetStateChanged(cachedState, state)
            if (!stateChanged && !artworkChanged) return@synchronized false
            if (stateChanged) {
                cachedState = state
                persistState(context, state)
            }
            if (artworkChanged) {
                replaceArtwork(context, artwork)
            } else if (stateChanged) {
                clearArtwork(context)
            }
            true
        }
        if (changed) {
            PristineAudioWidgetProvider.updateAll(context)
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

    private fun persistState(context: Context, state: WidgetPlaybackState) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_TITLE, state.title)
            .putString(KEY_ARTIST, state.artist)
            .putBoolean(KEY_IS_PLAYING, state.isPlaying)
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
            return
        }
        cachedState = WidgetPlaybackState(
            title = title,
            artist = prefs.getString(KEY_ARTIST, "").orEmpty(),
            isPlaying = prefs.getBoolean(KEY_IS_PLAYING, false),
        )
        cachedArtwork = loadArtworkFile(context)
    }

    private fun artworkFile(context: Context): File =
        File(context.cacheDir, ARTWORK_FILE_NAME)

    private fun replaceArtwork(context: Context, artwork: Bitmap?) {
        val old = cachedArtwork
        cachedArtwork = null
        old?.takeIf { !it.isRecycled }?.recycle()
        if (artwork == null || artwork.isRecycled) {
            artworkFile(context).delete()
            return
        }
        // Downscale + salin: salinan ini milik store, sumbernya bebas
        // di-recycle MediaSessionManager kapan pun.
        val owned = ownDownscaledCopy(artwork)
        cachedArtwork = owned
        try {
            FileOutputStream(artworkFile(context)).use { out ->
                owned.compress(Bitmap.CompressFormat.PNG, 100, out)
            }
        } catch (e: Exception) {
            android.util.Log.w("WidgetStateStore", "simpan artwork widget: ${e.message}")
        }
    }

    private fun clearArtwork(context: Context) {
        val old = cachedArtwork
        cachedArtwork = null
        old?.takeIf { !it.isRecycled }?.recycle()
        artworkFile(context).delete()
    }

    private fun loadArtworkFile(context: Context): Bitmap? {
        val file = artworkFile(context)
        if (!file.exists()) return null
        return try {
            BitmapFactory.decodeFile(file.absolutePath)
        } catch (e: Exception) {
            android.util.Log.w("WidgetStateStore", "baca artwork widget: ${e.message}")
            null
        }
    }

    private fun ownDownscaledCopy(src: Bitmap): Bitmap {
        val maxSide = maxOf(src.width, src.height).coerceAtLeast(1)
        val targetWidth: Int
        val targetHeight: Int
        if (maxSide <= ARTWORK_MAX_DIM) {
            targetWidth = src.width
            targetHeight = src.height
        } else {
            val scale = ARTWORK_MAX_DIM.toFloat() / maxSide
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
