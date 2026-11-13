package com.pristineaudio.playback

import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = NativePlaybackService.NAME)
class NativePlaybackService(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "NativePlaybackService"

        private const val LOG_TAG = "NativePlaybackService"
    }

    override fun getName() = NAME

    // ============================================================
    // SERVICE
    // ============================================================

    @ReactMethod
    fun startService() {
        val intent = android.content.Intent(reactApplicationContext, PlaybackService::class.java)
        reactApplicationContext.startForegroundService(intent)
    }

    @ReactMethod
    fun stopService() {
        val intent = android.content.Intent(reactApplicationContext, PlaybackService::class.java)
        reactApplicationContext.stopService(intent)
    }

    // ============================================================
    // TRANSPORT (unchanged)
    // ============================================================

    // reject kalau native play() mengembalikan false. Tanpa ini, kegagalan
    // dekoder (mis. URI yang belum di-resolve) hanya jadi log native, dan JS
    // tetap menandai lagu sebagai sedang diputar.
    @ReactMethod
    fun play(promise: Promise) {
        try {
            if (PlaybackNativeBridge.play()) {
                promise.resolve(null)
            } else {
                promise.reject("PLAY_FAILED", "native play() returned false - dekoder gagal membuka track")
            }
        } catch (e: Throwable) {
            promise.reject("PLAY_FAILED", e)
        }
    }

    @ReactMethod
    fun pause(promise: Promise) {
        try {
            PlaybackNativeBridge.pause()
            promise.resolve(null)
        } catch (e: Throwable) {
            promise.reject("PAUSE_FAILED", e)
        }
    }

    @ReactMethod
    fun stop(promise: Promise) {
        try {
            PlaybackNativeBridge.stop()
            promise.resolve(null)
        } catch (e: Throwable) {
            promise.reject("STOP_FAILED", e)
        }
    }

    @ReactMethod
    fun next(promise: Promise) {
        try {
            PlaybackNativeBridge.next()
            promise.resolve(null)
        } catch (e: Throwable) {
            promise.reject("NEXT_FAILED", e)
        }
    }

    @ReactMethod
    fun previous(promise: Promise) {
        try {
            PlaybackNativeBridge.previous()
            promise.resolve(null)
        } catch (e: Throwable) {
            promise.reject("PREVIOUS_FAILED", e)
        }
    }

    @ReactMethod
    fun seek(positionMs: Double, promise: Promise) {
        try {
            PlaybackNativeBridge.seek(positionMs.toLong())
            promise.resolve(null)
        } catch (e: Throwable) {
            promise.reject("SEEK_FAILED", e)
        }
    }

    @ReactMethod
    fun setShuffle(enabled: Boolean, promise: Promise) {
        try {
            PlaybackNativeBridge.setShuffle(enabled)
            promise.resolve(null)
        } catch (e: Throwable) {
            promise.reject("SET_SHUFFLE_FAILED", e)
        }
    }

    // Indeks trek aktif menurut native. Sync (tanpa Promise) karena ini
    // pembacaan cepat tanpa I/O - JS memakainya untuk menampilkan posisi di
    // queue, dan harus selalu akurat setelah next/prev/jumpTo.
    @ReactMethod(isBlockingSynchronousMethod = true)
    fun getCurrentIndex(): Int = PlaybackNativeBridge.getCurrentIndex()

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun getQueueSize(): Int = PlaybackNativeBridge.getQueueSize()

    // Pindah ke indeks tertentu di queue NATIVE. Ini pengganti pola lama
    // "hitung indeks di JS lalu setQueue ulang", yang menimpa queue native
    // dan membuang urutan shuffle yang hanya diketahui native.
    @ReactMethod
    fun jumpTo(index: Int, promise: Promise) {
        try {
            if (PlaybackNativeBridge.jumpTo(index)) {
                promise.resolve(null)
            } else {
                promise.reject("JUMP_FAILED", "jumpTo($index) gagal - indeks tidak valid?")
            }
        } catch (e: Throwable) {
            promise.reject("JUMP_FAILED", e)
        }
    }

    @ReactMethod
    fun setRepeatMode(mode: Int, promise: Promise) {
        try {
            PlaybackNativeBridge.setRepeatMode(mode)
            promise.resolve(null)
        } catch (e: Throwable) {
            promise.reject("SET_REPEAT_FAILED", e)
        }
    }

    // 🔥 FIX (2026-11-10, P-M9): laju playback (WSOLA time-stretch).
    @ReactMethod
    fun setPlaybackRate(rate: Double, promise: Promise) {
        try {
            PlaybackNativeBridge.setPlaybackRate(rate.toFloat())
            promise.resolve(null)
        } catch (e: Throwable) {
            promise.reject("SET_RATE_FAILED", e)
        }
    }

    // 🔥 FASE R (2026-11-11): retune — rasio pitch (phase vocoder).
    // KOREKSI 2026-11-11: method ini TERTINGGAL di commit a5f0c887 —
    // setPitchRatio cuma ditambah di NativePlaybackModule (@ReactMethod,
    // modul yang JS tidak panggil) + bridge (0 caller), sementara modul
    // yang JS panggil (NativePlaybackService, NAME="NativePlaybackService")
    // tidak punya method ini → JS proxy "is not a function". Rantai
    // lengkap: spec → NativePlaybackService (@ReactMethod, Promise) →
    // PlaybackNativeBridge → NativePlaybackModule.setPitchRatioFromService
    // → JNI nativeSetPitchRatio → controller->setPitchRatio.
    @ReactMethod
    fun setPitchRatio(ratio: Double, promise: Promise) {
        try {
            PlaybackNativeBridge.setPitchRatio(ratio.toFloat())
            promise.resolve(null)
        } catch (e: Throwable) {
            promise.reject("SET_PITCH_RATIO_FAILED", e)
        }
    }

    // ============================================================
    // 🔥 SET QUEUE — RAW URI LANGSUNG KE NATIVE (opsi B, 2026-11-13)
    // ============================================================
    //
    // DULU (sampai 2026-11-13): pre-resolve Kotlin — 5 file pertama di-copy
    // ke cache (resolveContentUriToPath), sisanya deferred mentah, resolve
    // on-demand via resolveUri(). Masalahnya: copy itu jalan DI thread
    // native-modules (sampai 3 detik / 5 file), dan selama itu SEMUA promise
    // lain (pause/seek/getPosition) antre di belakangnya — salah satu sumber
    // jeda JS<->native (audit bridge 2026-11-13).
    //
    // SEKARANG: URI mentah diteruskan apa adanya. Sisi native yang membuka
    // content:// lewat fd+AVIO (FFmpegDecoder::onOpen, B9) tanpa copy, dengan
    // fallback salin-ke-cache di C++ (ContentUriResolver::resolve) kalau fd
    // gagal. Terbukti live di logcat #18/#19. Karena itu pre-resolve Kotlin
    // (loop + resolveContentUriToPath + resolveUri + fnv1a64Hex + batas
    // MAX_PRE_RESOLVE/RESOLVE_TIMEOUT_MS) DIHAPUS seluruhnya — termasuk
    // varian tanpa batas di NativePlaybackModule.setQueue dan
    // ContentCacheValidator (tidak ada lagi pemakai).
    //
    // `sampleRates` = laju file (Hz) per entry uris, boleh null.
    //
    // 🔥 FIX (2026-10-07): laju file diteruskan ke native supaya stream bisa
    // dibuka di laju track (bit-perfect), bukan laju tertinggi perangkat.
    @ReactMethod
    fun setQueue(uris: ReadableArray, sampleRates: ReadableArray?, promise: Promise) {
        try {
            val list = ArrayList<String>(uris.size())
            // Index asli tiap entry di `list`. `continue` di loop bawah bisa
            // melewati entry, jadi laju harus dipasangkan berdasarkan posisi
            // asli, bukan urutan push.
            val rateIndexes = ArrayList<Int>(uris.size())
            val startTime = System.currentTimeMillis()

            for (i in 0 until uris.size()) {
                val raw = uris.getString(i) ?: continue
                rateIndexes.add(i)
                list.add(raw)
            }

            val elapsed = System.currentTimeMillis() - startTime
            android.util.Log.i(
                LOG_TAG,
                "setQueue: total=${uris.size()}, elapsed=${elapsed}ms"
            )

            PlaybackNativeBridge.setQueue(
                list.toTypedArray(),
                buildRateArray(sampleRates, rateIndexes, list.size)
            )
            promise.resolve(null)
        } catch (e: Throwable) {
            android.util.Log.e(LOG_TAG, "setQueue failed", e)
            promise.reject("SET_QUEUE_FAILED", e)
        }
    }

    // Petakan laju file ke posisi yang benar di queue hasil resolve.
    // Entry yang dilewati (`continue`) tidak punya pasangan laju.
    private fun buildRateArray(
        sampleRates: ReadableArray?,
        sourceIndexes: List<Int>,
        expectedSize: Int,
    ): IntArray {
        val rates = IntArray(expectedSize)
        if (sampleRates == null) return rates
        for (i in 0 until minOf(sourceIndexes.size, expectedSize)) {
            val src = sourceIndexes[i]
            if (src < sampleRates.size()) {
                rates[i] = try {
                    sampleRates.getInt(src)
                } catch (e: Exception) {
                    0
                }
            }
        }
        return rates
    }

    /**
     * Cleanup cache — hapus semua `audio_*` file yang menumpuk.
     * (Masih dipakai: C++ fallback copy (ContentUriResolver::resolve) tetap
     * menulis cache `audio_*` kalau fd+AVIO gagal — file itu dibersihkan di
     * sini. Yang dihapus opsi B hanyalah copy di sisi KOTLIN.)
     */
    @ReactMethod
    fun clearCache(promise: Promise) {
        try {
            val cacheDir = reactApplicationContext.cacheDir
            var deleted = 0
            var freedBytes = 0L

            cacheDir.listFiles()?.forEach { file ->
                if (file.name.startsWith("audio_") || file.name.startsWith("track_")) {
                    freedBytes += file.length()
                    if (file.delete()) deleted++
                }
            }

            android.util.Log.i(
                LOG_TAG,
                "clearCache: deleted=$deleted files, freed=${freedBytes / 1024 / 1024}MB"
            )
            promise.resolve(deleted)
        } catch (e: Exception) {
            promise.reject("CLEAR_CACHE_FAILED", e)
        }
    }

    // ============================================================
    // QUERY (unchanged — promise-based)
    // ============================================================

    @ReactMethod
    fun getPosition(promise: Promise) {
        try {
            promise.resolve(PlaybackNativeBridge.getPosition().toDouble())
        } catch (e: Throwable) {
            promise.reject("GET_POSITION_FAILED", e)
        }
    }

    @ReactMethod
    fun getStatus(promise: Promise) {
        try {
            promise.resolve(PlaybackNativeBridge.getStatus())
        } catch (e: Throwable) {
            promise.reject("GET_STATUS_FAILED", e)
        }
    }

    @ReactMethod
    fun getQueue(promise: Promise) {
        try {
            val queue = PlaybackNativeBridge.getQueue()
            promise.resolve(queue?.toList() ?: emptyList<String>())
        } catch (e: Throwable) {
            promise.reject("GET_QUEUE_FAILED", e)
        }
    }

    @ReactMethod
    fun getCurrentTrack(promise: Promise) {
        try {
            promise.resolve(PlaybackNativeBridge.getCurrentTrack() ?: "")
        } catch (e: Throwable) {
            promise.reject("GET_TRACK_FAILED", e)
        }
    }

    // ============================================================
    // MEDIA SESSION
    // ============================================================

    @ReactMethod
    fun updateMetadata(
        title: String,
        artist: String,
        album: String,
        durationMs: Double,
        artworkUri: String?,
        promise: Promise,
    ) {
        try {
            PlaybackNativeBridge.updateMetadata(title, artist, album, durationMs.toLong(), artworkUri)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("UPDATE_METADATA_FAILED", e)
        }
    }

    @ReactMethod
    fun updatePlaybackState(isPlaying: Boolean, positionMs: Double, promise: Promise) {
        try {
            PlaybackNativeBridge.updatePlaybackState(isPlaying, positionMs.toLong())
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("UPDATE_STATE_FAILED", e)
        }
    }

    // 🔥 MediaSession sync untuk shuffle/repeat (lock screen).
    @ReactMethod
    fun updateShuffleMode(enabled: Boolean, promise: Promise) {
        try {
            PlaybackNativeBridge.updateShuffleMode(enabled)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("UPDATE_SHUFFLE_FAILED", e)
        }
    }

    @ReactMethod
    fun updateRepeatMode(mode: Int, promise: Promise) {
        try {
            PlaybackNativeBridge.updateRepeatMode(mode)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("UPDATE_REPEAT_FAILED", e)
        }
    }

    // 🔥 Wajib untuk NativeEventEmitter supaya tidak warning di JS.
    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}

    // (Opsi B, 2026-11-13: seksi URI RESOLVER dihapus seluruhnya —
    // fnv1a64Hex + resolveContentUriToPath. Native membuka content://
    // lewat fd+AVIO; copy fallback ada di C++ ContentUriResolver.)
} 