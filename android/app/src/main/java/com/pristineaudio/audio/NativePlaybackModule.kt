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
    // 🔥 FASE R (2026-11-11): retune — rasio pitch (1.0 = A=440).
    private external fun nativeSetPitchRatio(ratio: Float)
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

    // 🔥 FASE R (2026-11-11): retune — rasio pitch (phase vocoder).
    @ReactMethod
    fun setPitchRatio(ratio: Double) {
        if (!ensureNativeReady()) return
        nativeSetPitchRatio(ratio.toFloat())
    }

    // (Opsi B, 2026-11-13: @ReactMethod setQueue DIHAPUS — varian copy
    // tanpa batas (semua URI di-copy, tanpa timeout) dan TIDAK PERNAH
    // dipanggil JS (spec NativePlaybackModule tidak diimpor siapa pun;
    // JS memanggil NativePlaybackService.setQueue). Yang live hanya
    // setQueueFromService di bawah, yang meneruskan URI mentah ke JNI.
    // buildRateArray modul ikut terhapus — hanya dipakai setQueue ini.)

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

    // (Opsi B, 2026-11-13: fnv1a64Hex + resolveContentUri DIHAPUS —
    // copy ke cache di sisi Kotlin. Satu-satunya pemakai adalah setQueue
    // modul yang ikut dihapus di atas. Penamaan cache `audio_<fnv1a64>`
    // tetap hidup di C++ (ContentUriResolver, fallback copy) dan di TS
    // (cacheNaming.ts, dipakai queueNavigation.ts).)

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
    fun setPitchRatioFromService(ratio: Float) { if (ensureNativeReady()) nativeSetPitchRatio(ratio) }
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