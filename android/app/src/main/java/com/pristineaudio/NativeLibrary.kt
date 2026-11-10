package com.pristineaudio

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
 * di-cache; kalau gagal, semua pemanggil mendapat false dan berperilaku
 * seperti engine tidak ada (sama seperti flag engineAvailable dulu).
 *
 * JNI_OnLoad (registrasi provider TurboModule + pointer JavaVM) ikut jalan
 * di saat load, seperti biasa — engine tetap TIDAK di-start di sana.
 */
object NativeLibrary {
    private const val TAG = "NativeLibrary"

    @Volatile
    private var loaded: Boolean? = null

    @Synchronized
    fun ensureLoaded(): Boolean {
        loaded?.let { return it }
        val ok = try {
            System.loadLibrary("pristine-audio")
            Log.d(TAG, "pristine-audio loaded (lazy, first native use)")
            true
        } catch (e: UnsatisfiedLinkError) {
            Log.e(TAG, "gagal load pristine-audio: ${e.message}")
            false
        }
        loaded = ok
        return ok
    }
}
