package com.pristineaudio.playback

import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import java.io.File
import java.util.concurrent.TimeUnit

@ReactModule(name = NativePlaybackService.NAME)
class NativePlaybackService(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "NativePlaybackService"

        // 🔥 Max time untuk resolve URI (early-out)
        private const val RESOLVE_TIMEOUT_MS = 3000L

        // 🔥 Resolve sampai N file, sisanya deferred (raw URI)
        private const val MAX_PRE_RESOLVE = 5

        // 🔥 Kalau user tap next, resolve on-demand
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
        } catch (e: Exception) {
            promise.reject("PLAY_FAILED", e)
        }
    }

    @ReactMethod
    fun pause(promise: Promise) {
        try {
            PlaybackNativeBridge.pause()
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("PAUSE_FAILED", e)
        }
    }

    @ReactMethod
    fun stop(promise: Promise) {
        try {
            PlaybackNativeBridge.stop()
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("STOP_FAILED", e)
        }
    }

    @ReactMethod
    fun next(promise: Promise) {
        try {
            PlaybackNativeBridge.next()
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("NEXT_FAILED", e)
        }
    }

    @ReactMethod
    fun previous(promise: Promise) {
        try {
            PlaybackNativeBridge.previous()
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("PREVIOUS_FAILED", e)
        }
    }

    @ReactMethod
    fun seek(positionMs: Double, promise: Promise) {
        try {
            PlaybackNativeBridge.seek(positionMs.toLong())
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("SEEK_FAILED", e)
        }
    }

    @ReactMethod
    fun setShuffle(enabled: Boolean, promise: Promise) {
        try {
            PlaybackNativeBridge.setShuffle(enabled)
            promise.resolve(null)
        } catch (e: Exception) {
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
        } catch (e: Exception) {
            promise.reject("JUMP_FAILED", e)
        }
    }

    @ReactMethod
    fun setRepeatMode(mode: Int, promise: Promise) {
        try {
            PlaybackNativeBridge.setRepeatMode(mode)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("SET_REPEAT_FAILED", e)
        }
    }

    // ============================================================
    // 🔥 SET QUEUE — LAZY RESOLVE + PROMISE
    // ============================================================

    /**
     * Set queue dengan lazy URI resolution.
     *
     * Strategi:
     * 1. Resolve max `MAX_PRE_RESOLVE` file pertama (biasanya current + buffer).
     * 2. Kalau waktu > `RESOLVE_TIMEOUT_MS`, sisanya simpan raw URI.
     * 3. Resolve sisanya on-demand via `resolveQueueIndex()` nanti.
     *
     * Efek: 5-30x lebih cepat dari resolve 50 file sekaligus.
     */
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
            var resolved = 0
            var deferred = 0

            for (i in 0 until uris.size()) {
                val raw = uris.getString(i) ?: continue

                // Cek dua kondisi early-out:
                // 1. Sudah resolve max N file
                // 2. Sudah lewat timeout
                val timedOut = (System.currentTimeMillis() - startTime) > RESOLVE_TIMEOUT_MS
                val maxReached = resolved >= MAX_PRE_RESOLVE

                rateIndexes.add(i)

                if (timedOut || maxReached) {
                    // Simpan raw URI — resolve nanti saat benar-benar diperlukan
                    list.add(raw)
                    deferred++
                } else {
                    // Resolve sekarang (copy ke cache)
                    val path = resolveContentUriToPath(raw)
                    list.add(path)
                    resolved++
                }
            }

            val elapsed = System.currentTimeMillis() - startTime
            android.util.Log.i(
                LOG_TAG,
                "setQueue: total=${uris.size()}, resolved=$resolved, deferred=$deferred, " +
                    "elapsed=${elapsed}ms"
            )

            PlaybackNativeBridge.setQueue(
                list.toTypedArray(),
                buildRateArray(sampleRates, rateIndexes, list.size)
            )
            promise.resolve(null)
        } catch (e: Exception) {
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

    // ============================================================
    // 🔥 RESOLVE ON-DEMAND
    // ============================================================

    /**
     * Resolve single URI on-demand.
     * Call ini dari JS saat user skip ke track yang belum di-resolve.
     *
     * @param rawUri content:// atau path
     * @return resolved path (atau raw URI kalau gagal)
     */
    @ReactMethod
    fun resolveUri(rawUri: String, promise: Promise) {
        try {
            val path = resolveContentUriToPath(rawUri)
            promise.resolve(path)
        } catch (e: Exception) {
            promise.reject("RESOLVE_FAILED", e)
        }
    }

    /**
     * Cleanup cache — hapus semua `audio_*` file yang menumpuk.
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
        } catch (e: Exception) {
            promise.reject("GET_POSITION_FAILED", e)
        }
    }

    @ReactMethod
    fun getStatus(promise: Promise) {
        try {
            promise.resolve(PlaybackNativeBridge.getStatus())
        } catch (e: Exception) {
            promise.reject("GET_STATUS_FAILED", e)
        }
    }

    @ReactMethod
    fun getQueue(promise: Promise) {
        try {
            val queue = PlaybackNativeBridge.getQueue()
            promise.resolve(queue?.toList() ?: emptyList<String>())
        } catch (e: Exception) {
            promise.reject("GET_QUEUE_FAILED", e)
        }
    }

    @ReactMethod
    fun getCurrentTrack(promise: Promise) {
        try {
            promise.resolve(PlaybackNativeBridge.getCurrentTrack() ?: "")
        } catch (e: Exception) {
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

    // ============================================================
    // URI RESOLVER
    // ============================================================

    /**
     * Resolve `content://` URI ke path file (copy ke cache).
     *
     * - Kalau uri sudah path (/storage/...) → return as-is.
     * - Kalau uri content:// → copy ke cache dir, return path.
     * - Kalau gagal → return uri asli (bukan ideal, tapi tidak crash).
     */
    private fun resolveContentUriToPath(uriString: String): String {
        // Sudah path biasa
        if (!uriString.startsWith("content://")) {
            return uriString
        }

        return try {
            val resolver = reactApplicationContext.contentResolver
            val uri = android.net.Uri.parse(uriString)

            // Extension detection
            val ext = resolver.getType(uri)?.substringAfterLast('/') ?: "cache"
            val file = File(
                reactApplicationContext.cacheDir,
                "audio_${uriString.hashCode()}.$ext"
            )

            // Kalau sudah ada dan valid, pakai yang ada
            if (file.exists() && file.length() > 0L) {
                android.util.Log.d(
                    LOG_TAG,
                    "resolveContentUriToPath: cache hit ${file.name} (${file.length()} bytes)"
                )
                return file.absolutePath
            }

            // Copy dari content resolver
            val inputStream = resolver.openInputStream(uri)
                ?: run {
                    android.util.Log.e(LOG_TAG, "openInputStream null for $uriString")
                    return uriString
                }

            inputStream.use { input ->
                file.outputStream().use { output ->
                    input.copyTo(output)
                }
            }

            android.util.Log.d(
                LOG_TAG,
                "resolveContentUriToPath: cached ${file.name} (${file.length()} bytes)"
            )

            file.absolutePath
        } catch (e: Exception) {
            android.util.Log.e(LOG_TAG, "resolveContentUriToPath failed: $uriString", e)
            uriString
        }
    }
} 