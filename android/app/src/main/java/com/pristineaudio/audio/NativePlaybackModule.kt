package com.pristineaudio.audio

import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import com.pristineaudio.NativeLibrary
import com.pristineaudio.playback.PlaybackNativeBridge

@ReactModule(name = NativePlaybackModule.NAME)
class NativePlaybackModule(
    // 🔥 Simpan param constructor ke field: param constructor hanya bisa
    // diakses di init block / initializer, BUKAN di getter property.
    private val context: ReactApplicationContext
) :
    ReactContextBaseJavaModule(context) {

    companion object {
        const val NAME = "NativePlaybackModule"

        @Volatile
        var instance: NativePlaybackModule? = null
    }

    init {
        instance = this
        // 🔥 LAZY LOAD (2026-11-10): System.loadLibrary TIDAK lagi di sini.
        // Dulu load di init memuat ~40MB .so di main thread saat modul
        // dibuat (cold start). Sekarang load terjadi di ensureNativeReady(),
        // saat pertama kali ada panggilan native (JS thread).
        // Registrasi event emitter (panggilan JNI) ikut pindah ke sana —
        // tidak bisa di init karena butuh library sudah termuat.
    }

    @Volatile
    private var emitterRegistered = false

    /**
     * Pastikan library native termuat + event emitter terdaftar.
     * Dipanggil di awal setiap method yang menyentuh JNI. Setelah berhasil
     * sekali, panggilan berikutnya hanya cek flag (murah).
     */
    private fun ensureNativeReady(): Boolean {
        if (!NativeLibrary.ensureLoaded()) return false
        if (!emitterRegistered) {
            synchronized(this) {
                if (!emitterRegistered) {
                    try {
                        nativeInitEventEmitter()
                    } catch (e: Throwable) {
                        android.util.Log.e("NativePlaybackModule", "registrasi event emitter gagal", e)
                    }
                    emitterRegistered = true
                }
            }
        }
        return true
    }

    // Native methods

    // 🔥 Akses context untuk bridge event (PlaybackNativeBridge.emit*).
    //
    // getReactApplicationContext() di BaseJavaModule adalah protected, jadi
    // PlaybackNativeBridge (object, bukan subclass) tidak bisa pakai itu
    // langsung — butuh property publik. Nama property TIDAK boleh
    // `reactApplicationContext`: Kotlin akan generate getter
    // getReactApplicationContext() yang menabrak method protected di superclass
    // ("Accidental override"). Pakai nama lain.
    val reactContext: ReactApplicationContext
        get() = context

    // 🔥 Callback native→JS: decoder EOF. Di-emit dari C++ (thread decoder).
    // Tidak boleh crash kalau JS belum siap — bridge tolak kalau instance null.
    @JvmOverloads
    fun onNativeTrackEnded(uri: String?) {
        if (uri.isNullOrEmpty()) return
        android.util.Log.d("NativePlaybackModule", "onNativeTrackEnded: $uri")
        PlaybackNativeBridge.emitTrackEnded(uri)
    }

    private external fun nativeInitEventEmitter()
    private external fun nativePlay(): Boolean
    private external fun nativePause()
    private external fun nativeStop()
    private external fun nativeSeek(positionMs: Long)
    private external fun nativeGetPosition(): Long
    private external fun nativeGetStatus(): Int

    // Queue & navigasi (native yang memegang queue dan indeks)
    private external fun nativeGetCurrentIndex(): Int
    private external fun nativeGetQueueSize(): Int
    private external fun nativeJumpTo(index: Int): Boolean
    private external fun nativeNext()
    private external fun nativePrevious()
    private external fun nativeSetShuffle(enabled: Boolean)
    private external fun nativeSetRepeatMode(mode: Int)
    private external fun nativeSetPlaybackRate(rate: Float)
    private external fun nativeGetQueue(): Array<String>
    private external fun nativeSetQueue(uris: Array<String>, sampleRates: IntArray)
    private external fun nativeGetCurrentTrack(): String

    override fun getName() = NAME

    // ========== React methods ==========
    // play() mengembalikan Promise: kegagalan dekoder (mis. URI yang belum
    // di-resolve) harus sampai ke JS. Sebelumnya void, sehingga UI tetap
    // menampilkan "sedang diputar" padahal play() gagal di native.
    @ReactMethod
    fun play(promise: Promise) {
        if (!ensureNativeReady()) {
            promise.reject("NATIVE_UNAVAILABLE", "Engine native belum termuat")
            return
        }
        try {
            val ok = nativePlay()
            if (ok) {
                promise.resolve(null)
            } else {
                promise.reject("PLAY_FAILED", "native play() returned false")
            }
        } catch (e: Exception) {
            promise.reject("PLAY_FAILED", e)
        }
    }

    @ReactMethod
    fun pause() {
        if (!ensureNativeReady()) return
        nativePause()
    }

    @ReactMethod
    fun stop() {
        if (!ensureNativeReady()) return
        nativeStop()
    }

    @ReactMethod
    fun seek(positionMs: Double) {
        if (!ensureNativeReady()) return
        nativeSeek(positionMs.toLong())
    }

    @ReactMethod
    fun next() {
        if (!ensureNativeReady()) return
        nativeNext()
    }

    @ReactMethod
    fun previous() {
        if (!ensureNativeReady()) return
        nativePrevious()
    }

    @ReactMethod
    fun setShuffle(enabled: Boolean) {
        if (!ensureNativeReady()) return
        nativeSetShuffle(enabled)
    }

    @ReactMethod
    fun setRepeatMode(mode: Int) {
        if (!ensureNativeReady()) return
        nativeSetRepeatMode(mode)
    }

    // 🔥 FIX (2026-11-10, P-M9): laju playback (WSOLA time-stretch).
    @ReactMethod
    fun setPlaybackRate(rate: Double) {
        if (!ensureNativeReady()) return
        nativeSetPlaybackRate(rate.toFloat())
    }

    // `sampleRates` = laju file (Hz) per entry di `uris`, boleh null.
    //
    // 🔥 FIX (2026-10-07): laju file ikut dikirim supaya C++ bisa membuka
    // stream di laju track (bit-perfect) alih-alih laju tertinggi perangkat.
    // Sebelumnya array ini tidak ada dan laju file hilang sebelum sampai ke
    // native. Elemen yang tidak diketahui dikirim 0.
    @ReactMethod
    fun setQueue(uris: ReadableArray, sampleRates: ReadableArray?) {
        if (!ensureNativeReady()) return
        val list = ArrayList<String>()
        for (i in 0 until uris.size()) {
            val uri = uris.getString(i)
            if (uri != null) {
                list.add(resolveContentUri(uri))
            }
        }
        nativeSetQueue(list.toTypedArray(), buildRateArray(sampleRates, list.size))
    }

    // Ambil laju per track dari ReadableArray, samakan panjangnya dengan
    // daftar URI. Nilai non-numerik / tidak ada menjadi 0 (= tidak diketahui),
    // yang ditafsirkan native sebagai "deteksi sendiri".
    private fun buildRateArray(sampleRates: ReadableArray?, expectedSize: Int): IntArray {
        val rates = IntArray(expectedSize)
        if (sampleRates == null) return rates
        val count = minOf(sampleRates.size(), expectedSize)
        for (i in 0 until count) {
            rates[i] = try {
                sampleRates.getInt(i)
            } catch (e: Exception) {
                0
            }
        }
        return rates
    }

    // Non-void return → WAJIB isBlockingSynchronousMethod = true
    @ReactMethod(isBlockingSynchronousMethod = true)
    fun getPosition(): Double = if (ensureNativeReady()) nativeGetPosition().toDouble() else 0.0

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun getStatus(): Int = if (ensureNativeReady()) nativeGetStatus() else 0

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun getQueue(): WritableArray {
        val queue = if (ensureNativeReady()) nativeGetQueue() else emptyArray<String>()
        val array = Arguments.createArray()
        for (item in queue) {
            array.pushString(item)
        }
        return array
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun getCurrentTrack(): String = if (ensureNativeReady()) nativeGetCurrentTrack() else ""

    // Indeks trek aktif menurut NATIVE. -1 kalau queue kosong.
    @ReactMethod(isBlockingSynchronousMethod = true)
    fun getCurrentIndex(): Int = if (ensureNativeReady()) nativeGetCurrentIndex() else -1

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun getQueueSize(): Int = if (ensureNativeReady()) nativeGetQueueSize() else 0

    // Pindah ke indeks tertentu di queue native. Promise, bukan sync, karena
    // ini memuat trek (menyentuh disk) dan bisa gagal.
    @ReactMethod
    fun jumpTo(index: Int, promise: Promise) {
        if (!ensureNativeReady()) {
            promise.reject("NATIVE_UNAVAILABLE", "Engine native belum termuat")
            return
        }
        try {
            if (nativeJumpTo(index)) {
                promise.resolve(null)
            } else {
                promise.reject("JUMP_FAILED", "nativeJumpTo($index) gagal - indeks tidak valid?")
            }
        } catch (e: Exception) {
            promise.reject("JUMP_FAILED", e)
        }
    }

    // ========== Helper ==========
    private fun resolveContentUri(uriString: String): String {
        if (!uriString.startsWith("content://")) {
            return uriString
        }

        return try {
            val uri = android.net.Uri.parse(uriString)
            val resolver = reactApplicationContext.contentResolver

            // 🔥 FIX: Copy ke cache dir (reliable, tidak ada race condition GC)
            // detachFd() menyebabkan fd di-close oleh GC sebelum FFmpeg buka
            //
            // 🔥 FIX (2026-11-11, D-M8): penamaan cache DISATUKAN dengan
            // NativePlaybackService + ContentUriResolver native: prefix
            // `audio_` dan ext default `cache`. Sebelumnya modul ini memakai
            // `track_` + `tmp`, jadi satu URI yang sama menghasilkan DUA file
            // cache (audio_<hash>.mpeg dan track_<hash>.tmp) kalau pernah
            // lewat jalur ini — dan hit check jalur lain tidak melihat file
            // dari jalur ini.
            val cacheDir = reactApplicationContext.cacheDir
            val ext = resolver.getType(uri)?.substringAfterLast('/') ?: "cache"
            val cacheFile = java.io.File(cacheDir, "audio_${uriString.hashCode()}.$ext")

            // 🔥 FIX (2026-11-11, D-M9): tulis ke temp + rename atomik —
            // file target hanya muncul kalau isinya lengkap; kill di tengah
            // copy meninggalkan .tmp, bukan hit palsu (lihat
            // NativePlaybackService.resolveContentUriToPath).
            if (!cacheFile.exists() || cacheFile.length() == 0L) {
                val tmpFile = java.io.File(cacheDir, "${cacheFile.name}.${System.nanoTime()}.tmp")
                try {
                    resolver.openInputStream(uri)?.use { input ->
                        tmpFile.outputStream().use { output ->
                            input.copyTo(output)
                        }
                    }
                    if (!tmpFile.renameTo(cacheFile)) {
                        android.util.Log.e(
                            "NativePlaybackModule",
                            "resolveContentUri: rename ${tmpFile.name} gagal"
                        )
                        tmpFile.delete()
                        return uriString
                    }
                } catch (e: Exception) {
                    tmpFile.delete()
                    throw e
                }
            }

            android.util.Log.d(
                "NativePlaybackModule",
                "resolveContentUri: $uriString → ${cacheFile.absolutePath} (${cacheFile.length()} bytes)"
            )

            cacheFile.absolutePath
        } catch (e: Exception) {
            android.util.Log.e(
                "NativePlaybackModule",
                "resolveContentUri failed: $uriString", e
            )
            uriString
        }
    }

    // ========== Service-friendly methods (tanpa React) ==========
    fun playFromService(): Boolean = if (ensureNativeReady()) nativePlay() else false
    fun pauseFromService() { if (ensureNativeReady()) nativePause() }
    fun stopFromService() { if (ensureNativeReady()) nativeStop() }
    fun seekFromService(positionMs: Long) { if (ensureNativeReady()) nativeSeek(positionMs) }
    fun nextFromService() { if (ensureNativeReady()) nativeNext() }
    fun previousFromService() { if (ensureNativeReady()) nativePrevious() }
    fun setShuffleFromService(enabled: Boolean) { if (ensureNativeReady()) nativeSetShuffle(enabled) }
    fun setRepeatModeFromService(mode: Int) { if (ensureNativeReady()) nativeSetRepeatMode(mode) }
    fun setPlaybackRateFromService(rate: Float) { if (ensureNativeReady()) nativeSetPlaybackRate(rate) }
    fun getQueueFromService(): Array<String> = if (ensureNativeReady()) nativeGetQueue() else emptyArray()
    fun setQueueFromService(uris: Array<String>, sampleRates: IntArray = IntArray(uris.size)) {
        if (ensureNativeReady()) nativeSetQueue(uris, sampleRates)
    }
    fun getCurrentTrackFromService(): String = if (ensureNativeReady()) nativeGetCurrentTrack() else ""
    fun getPositionFromService(): Double = if (ensureNativeReady()) nativeGetPosition().toDouble() else 0.0
    fun getStatusFromService(): Int = if (ensureNativeReady()) nativeGetStatus() else 0
    fun getCurrentIndexFromService(): Int = if (ensureNativeReady()) nativeGetCurrentIndex() else -1
    fun getQueueSizeFromService(): Int = if (ensureNativeReady()) nativeGetQueueSize() else 0
    fun jumpToFromService(index: Int): Boolean = if (ensureNativeReady()) nativeJumpTo(index) else false
} 