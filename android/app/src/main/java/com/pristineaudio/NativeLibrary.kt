package com.pristineaudio

import android.os.SystemClock
import android.util.Log

/**
 * Lazy loader untuk libpristine-audio.so.
 *
 * Dulu setiap modul memanggil System.loadLibrary("pristine-audio") di blok
 * init-nya, dan MainApplication juga — jadi ~40MB .so (lib ini + dependency
 * closure: libavcodec, libavformat, libreactnative, ...) dimuat di main
 * thread saat cold start, tepat sebelum freeze 114-302 frame teramati
 * (logcat 2026-11-10).
 *
 * Sekarang load terjadi saat pertama kali ada panggilan native (lazy), di
 * thread pemanggil itu (JS thread untuk panggilan TurboModule/legacy) —
 * main thread tidak pernah diblokir memuat .so. Sekali berhasil, hasilnya
 * di-cache; kalau gagal, dicoba ulang dengan throttle (lihat
 * RETRY_INTERVAL_MS di bawah) — bukan "tidak ada" selamanya sampai restart.
 *
 * JNI_OnLoad (registrasi provider TurboModule + pointer JavaVM) ikut jalan
 * di saat load, seperti biasa — engine tetap TIDAK di-start di sana.
 */
object NativeLibrary {
    private const val TAG = "NativeLibrary"

    @Volatile
    private var loaded: Boolean? = null

    // F11: jeda minimal antar percobaan load yang gagal. Dulu `loaded =
    // false` di-cache selamanya, jadi sekali gagal (mis. install paruh
    // jalan) seluruh engine "tidak ada" sampai app di-restart paksa. Sukses
    // tetap di-cache selamanya. Gagal dicoba ulang paling sering 10 detik
    // sekali supaya jalur panas (engineAvailable di tiap panggilan DSP,
    // getPosition) tidak memanggil loadLibrary tiap kali saat engine memang
    // tidak ada.
    private const val RETRY_INTERVAL_MS = 10_000L

    @Volatile
    private var lastFailedAtMs: Long = 0L

    @Synchronized
    fun ensureLoaded(): Boolean {
        loaded?.let { return it }
        val now = SystemClock.elapsedRealtime()
        if (now - lastFailedAtMs < RETRY_INTERVAL_MS) return false
        val ok = try {
            System.loadLibrary("pristine-audio")
            Log.d(TAG, "pristine-audio loaded (lazy, first native use)")
            true
        } catch (e: UnsatisfiedLinkError) {
            Log.e(TAG, "gagal load pristine-audio: ${e.message}")
            false
        }
        if (ok) {
            loaded = true
        } else {
            lastFailedAtMs = now
        }
        return ok
    }
}
