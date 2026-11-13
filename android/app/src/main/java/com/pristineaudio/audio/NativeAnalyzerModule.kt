package com.pristineaudio.audio

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule
import android.os.Process
import android.util.Log
import com.pristineaudio.NativeLibrary
import java.util.concurrent.Executors

/**
 * Jembatan analisis spektral offline: file audio -> JSON hasil FFT.
 *
 * Dibuat 2026-11-11 (deteksi file hi-res/lossless palsu — tab Analyzer).
 * Rantai lengkap:
 * ```
 * TS spectralAnalysis.ts
 *   -> spec NativeAnalyzerModule.analyzeFile(uri)   [KELAS INI, @ReactMethod]
 *   -> JNI nativeAnalyzeFile                        [jni/NativeAnalyzerModule.cpp]
 *   -> pristine::analyzer::analyzeFile(path)        [decoder/AudioFileAnalyzer]
 *        -> FFmpegDecoder (decode, laju asli) + FFTPlan (FFT 8192)
 *   <- JSON string: { ok, measuredCutoffHz, lsbZeroRatio16, ... }
 * ```
 *
 * Pekerjaan berat (decode + FFT) jalan sinkron di background thread
 * berprioritas rendah (THREAD_PRIORITY_BACKGROUND) — bukan audio
 * thread, bukan main thread, bukan thread modul React. Decode 5
 * jendela kecil biasanya < 1 detik untuk file lokal.
 *
 * Kontrak Promise ke TS tetap sama: resolve JSON atau reject dengan
 * kode yang sama. Satu pemanggilan = satu tugas di executor, dan
 * tugas itu menyelesaikan promise tepat sekali (resolve ATAU reject).
 *
 * Kontrak kegagalan (pelajaran dari visualizer): tidak ada string kosong
 * diam-diam — null / exception di-reject dengan kode yang jelas supaya
 * TS bisa menampilkan "tidak dapat diverifikasi", bukan verdict palsu.
 */
@ReactModule(name = NativeAnalyzerModule.NAME)
class NativeAnalyzerModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    // Lazy load (pola yang sama dengan NativeVisualizerBridge): jangan
    // muat .so di init — muat saat pertama kali dibutuhkan.
    private val nativeAvailable: Boolean
        get() = NativeLibrary.ensureLoaded()

    companion object {
        const val NAME = "NativeAnalyzerModule"
        private const val TAG = "NativeAnalyzerModule"
    }

    // Executor satu thread untuk analisis: panggilan berurutan tidak
    // saling berebut decode/FFT, dan prioritas rendah supaya analisis
    // offline tidak mengganggu playback / UI. Prioritas di-set di
    // dalam thread-nya sendiri (setThreadPriority hanya berlaku
    // untuk thread yang memanggilnya).
    private val analyzerExecutor = Executors.newSingleThreadExecutor { runnable ->
        Thread({
            Process.setThreadPriority(Process.THREAD_PRIORITY_BACKGROUND)
            runnable.run()
        }, "AnalyzerWorker")
    }

    override fun getName() = NAME

    private external fun nativeAnalyzeFile(uri: String): String?

    @ReactMethod
    fun analyzeFile(uri: String, promise: Promise) {
        if (!nativeAvailable) {
            promise.reject(
                "ANALYZER_UNAVAILABLE",
                "Engine native tidak dimuat - analisis spektral tidak bisa aktif",
            )
            return
        }

        if (uri.isBlank()) {
            promise.reject("ANALYZER_BAD_URI", "URI file kosong")
            return
        }

        // Validasi cepat di atas tetap di thread modul; hanya pemanggilan
        // JNI yang berat yang pindah ke background thread. Promise
        // React Native aman diselesaikan dari thread mana pun.
        analyzerExecutor.execute {
            try {
                val json = nativeAnalyzeFile(uri)
                if (json == null) {
                    promise.reject(
                        "ANALYZER_ERROR",
                        "Analisis spektral gagal (native mengembalikan null)",
                    )
                } else {
                    Log.d(TAG, "analyzeFile selesai (${json.length} karakter)")
                    promise.resolve(json)
                }
            } catch (e: Throwable) {
                // Throwable, bukan Exception: UnsatisfiedLinkError adalah Error.
                Log.e(TAG, "analyzeFile gagal: ${e.message}", e)
                promise.reject("ANALYZER_ERROR", "Analisis spektral gagal: ${e.message}")
            }
        }
    }

    override fun onCatalystInstanceDestroy() {
        Log.d(TAG, "Bridge dihancurkan")
    }
}
