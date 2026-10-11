package com.pristineaudio.visualizer

import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import android.util.Log
import kotlin.math.ln
import kotlin.math.sqrt

/**
 * Jembatan visualizer: sample audio dari engine C++ -> 128 bin spektrum -> JS.
 *
 * ## Rantai data
 *
 * ```
 * AudioCallback (C++, audio thread)
 *   -> VisualizerBuffer.write()          mono mixdown, ring buffer 2048
 *   -> EngineManager::engine().getVisualizerData()   (UI thread)
 *   -> JNI Java_..._getVisualizerData    mengembalikan 256 sample MENTAH
 *   -> [KELAS INI] FFT 2048 -> magnitude -> 128 bin log-scaled
 *   -> JS: getFFTData() -> number[128]
 * ```
 *
 * ## Kenapa FFT-nya di sini, bukan di C++
 *
 * Implementasi FFT native ada di `cpp/fft/FFTPlan.{h,cpp}` (radix-2), tapi
 * JNI yang mengeksposnya belum ada - `NativeVisualizerModule.cpp` hanya
 * mengembalikan sample mentah 256 float. Sampai itu tersambung, komputasi
 * spektrum dilakukan di sisi Kotlin memakai `java.lang.Math`/kotlin.math,
 * sehingga visualizer bisa berfungsi tanpa menambah jalur JNI baru.
 *
 * Kalau nanti FFT native dihubungkan, kelas ini cukup meneruskan hasilnya -
 * bagian FFT-nya bisa dihapus tanpa mengubah kontrak ke JS (tetap 128 bin,
 * 0.0-1.0).
 *
 * ## Kenapa 128 bin
 *
 * `src/features/visualizer/api/fft.ts` memvalidasi `length === 128` dan
 * mengembalikan data kosong kalau tidak cocok. Kontrak itu dipertahankan.
 *
 * ## Kenapa tidak ada lagi array kosong diam-diam
 *
 * Versi sebelumnya mengembalikan `Arguments.createArray()` (array kosong)
 * baik saat native tidak tersedia maupun saat terjadi exception. Akibatnya
 * kegagalan terlihat seperti "tidak ada suara", bukan error - dan UI
 * menggambar garis datar tanpa penjelasan. Sekarang kegagalan di-reject
 * dengan kode yang jelas; pemanggil di JS memutuskan apa yang ditampilkan.
 */
@ReactModule(name = NativeVisualizerBridge.NAME)
class NativeVisualizerBridge(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private var nativeAvailable = false

    companion object {
        const val NAME = "NativeVisualizerBridge"
        private const val TAG = "NativeVisualizerBridge"

        /** FFT size. Pangkat dua. Ini yang menentukan resolusi frekuensi. */
        private const val FFT_SIZE = 2048

        /** Jumlah bin yang dikirim ke JS. Dipertahankan agar cocok dengan fft.ts. */
        private const val OUTPUT_BINS = 128

        // Rentang dinamis yang dipetakan ke 0.0-1.0, dalam dB.
        // -80 dB (praktis senyap) sampai -10 dB (keras). Batas atas bukan 0 dB
        // supaya puncak tidak langsung mentok di 1.0 dan terlihat "penuh".
        private const val DB_FLOOR = -80.0
        private const val DB_CEIL = -10.0
    }

    init {
        nativeAvailable = try {
            System.loadLibrary("pristine-audio")
            Log.d(TAG, "Native engine loaded untuk visualizer")
            true
        } catch (e: UnsatisfiedLinkError) {
            Log.w(TAG, "Native engine tidak tersedia: ${e.message}")
            false
        }
    }

    override fun getName() = NAME

    private external fun getVisualizerData(): FloatArray

    // =====================================================
    // SIKLUS HIDUP
    // =====================================================

    /**
     * Tidak ada lagi objek `android.media.audiofx.Visualizer` di sini.
     *
     * Versi sebelumnya membuat `Visualizer(audioSessionId)` dengan captureSize
     * dan enabled=true, lalu MEMBUANG hasilnya - `getFFTData()` tidak pernah
     * membacanya. Itu bukan cuma sia-sia: objek itu menahan sumber daya audiofx
     * yang bisa bentrok dengan sesi Oboe low-latency.
     *
     * Data sekarang datang dari `VisualizerBuffer` di dalam engine C++ sendiri,
     * yang diisi AudioCallback pada tiap frame. Jadi tidak ada API sistem yang
     * perlu diinisialisasi.
     */
    @ReactMethod
    fun startVisualizer(audioSessionId: Int, promise: Promise) {
        if (!nativeAvailable) {
            promise.reject(
                "VISUALIZER_UNAVAILABLE",
                "Engine native tidak dimuat - visualizer tidak bisa aktif",
            )
            return
        }

        // audioSessionId tidak dipakai lagi (data dari engine sendiri), tapi
        // parameternya dipertahankan agar kontrak dengan TS tidak berubah.
        Log.d(TAG, "Visualizer siap (sesi $audioSessionId, data dari engine native)")
        promise.resolve(true)
    }

    @ReactMethod
    fun stopVisualizer() {
        Log.d(TAG, "Visualizer dihentikan")
    }

    // =====================================================
    // DATA
    // =====================================================

    @ReactMethod
    fun getFFTData(promise: Promise) {
        if (!nativeAvailable) {
            promise.reject(
                "VISUALIZER_UNAVAILABLE",
                "Engine native tidak dimuat",
            )
            return
        }

        try {
            val samples = getVisualizerData()

            if (samples.size < FFT_SIZE) {
                promise.reject(
                    "VISUALIZER_SHORT_BUFFER",
                    "Engine mengembalikan ${samples.size} sample, butuh $FFT_SIZE",
                )
                return
            }

            val bins = computeSpectrum(samples)

            val array = Arguments.createArray()
            for (v in bins) {
                array.pushDouble(v.toDouble())
            }
            promise.resolve(array)
        } catch (e: Throwable) {
            // Throwable, bukan Exception: UnsatisfiedLinkError adalah Error.
            // Versi sebelumnya menangkap Exception saja sehingga error JNI
            // lolos ke luar try dan menjatuhkan pemanggilan tanpa pesan.
            Log.e(TAG, "getFFTData gagal: ${e.message}", e)
            promise.reject("VISUALIZER_ERROR", "Gagal menghitung spektrum: ${e.message}")
        }
    }

    // =====================================================
    // FFT + PEMETAAN KE 128 BIN
    // =====================================================

    /**
     * Hitung spektrum magnitude dari [samples], kembalikan [OUTPUT_BINS] nilai
     * ternormalisasi 0.0-1.0 (log-scaled).
     */
    private fun computeSpectrum(samples: FloatArray): FloatArray {
        val re = FloatArray(FFT_SIZE)
        val im = FloatArray(FFT_SIZE)

        // Ambil FFT_SIZE sample terakhir dan terapkan jendela Hann.
        // Hann penting: tanpa itu, tepi blok yang terpotong menimbulkan
        // spektral leakage (puncak palsu di sekitar nada).
        val offset = samples.size - FFT_SIZE
        for (i in 0 until FFT_SIZE) {
            val hann = 0.5 * (1.0 - kotlin.math.cos(2.0 * Math.PI * i / (FFT_SIZE - 1)))
            re[i] = (samples[offset + i] * hann).toFloat()
            im[i] = 0.0f
        }

        fftInPlace(re, im)

        // Magnitude hanya sampai Nyquist (paruh pertama), lalu dikelompokkan.
        val half = FFT_SIZE / 2
        val magnitude = FloatArray(half)
        for (i in 0 until half) {
            magnitude[i] = sqrt(re[i] * re[i] + im[i] * im[i]) / half
        }

        return mapToLogBins(magnitude)
    }

    /**
     * FFT radix-2 in-place (decimation in time). Forward, tanpa normalisasi.
     *
     * Ditulis di sini supaya visualizer bisa hidup tanpa menunggu jalur JNI
     * FFT native. Sama algoritmenya dengan `cpp/fft/FFTPlan.cpp` - kalaupun
     * nanti salah satu dipakai, hasilnya sepadan.
     */
    private fun fftInPlace(re: FloatArray, im: FloatArray) {
        val n = re.size

        // Bit-reversal permutation
        var j = 0
        for (i in 1 until n) {
            var bit = n shr 1
            while (j and bit != 0) {
                j = j xor bit
                bit = bit shr 1
            }
            j = j or bit
            if (i < j) {
                var tmp = re[i]; re[i] = re[j]; re[j] = tmp
                tmp = im[i]; im[i] = im[j]; im[j] = tmp
            }
        }

        // Butterfly
        var len = 2
        while (len <= n) {
            val ang = -2.0 * Math.PI / len
            val wRe = kotlin.math.cos(ang).toFloat()
            val wIm = kotlin.math.sin(ang).toFloat()

            var i = 0
            while (i < n) {
                var curRe = 1.0f
                var curIm = 0.0f
                for (k in 0 until len / 2) {
                    val uRe = re[i + k]
                    val uIm = im[i + k]
                    val vRe = re[i + k + len / 2] * curRe - im[i + k + len / 2] * curIm
                    val vIm = re[i + k + len / 2] * curIm + im[i + k + len / 2] * curRe

                    re[i + k] = uRe + vRe
                    im[i + k] = uIm + vIm
                    re[i + k + len / 2] = uRe - vRe
                    im[i + k + len / 2] = uIm - vIm

                    val nextRe = curRe * wRe - curIm * wIm
                    curIm = curRe * wIm + curIm * wRe
                    curRe = nextRe
                }
                i += len
            }
            len = len shl 1
        }
    }

    /**
     * Kelompokkan [half] bin magnitude linear menjadi [OUTPUT_BINS] bin
     * log-scaled 0.0-1.0.
     *
     * Pengelompokan memakai batas logaritmik, bukan pembagian rata: telinga
     * mendengar frekuensi secara logaritmik, jadi pembagian rata akan
     * menumpuk hampir semua detail musik di beberapa bin pertama.
     */
    private fun mapToLogBins(magnitude: FloatArray): FloatArray {
        val out = FloatArray(OUTPUT_BINS)
        val half = magnitude.size

        for (b in 0 until OUTPUT_BINS) {
            // Batas bawah/atas bin b pada skala log.
            val lo = logIndex(b.toDouble() / OUTPUT_BINS, half)
            val hi = logIndex((b + 1).toDouble() / OUTPUT_BINS, half)

            var sum = 0.0f
            var count = 0
            for (i in lo until maxOf(hi, lo + 1)) {
                if (i < half) {
                    sum += magnitude[i]
                    count++
                }
            }

            val linear = if (count > 0) sum / count else 0.0f

            // dB, lalu petakan ke 0.0-1.0.
            val db = 20.0 * ln(maxOf(linear, 1e-9).toDouble()) / ln(10.0)
            val normalized = ((db - DB_FLOOR) / (DB_CEIL - DB_FLOOR)).coerceIn(0.0, 1.0)

            out[b] = normalized.toFloat()
        }

        return out
    }

    /** Indeks bin linear untuk posisi normalisasi [t] (0..1) pada skala log. */
    private fun logIndex(t: Double, half: Int): Int {
        if (t <= 0.0) return 0
        val minF = 20.0      // batas bawah pendengaran (Hz)
        val maxF = 20000.0   // batas atas
        val freq = minF * Math.pow(maxF / minF, t)
        val nyquist = 22050.0
        val idx = (freq / nyquist * half).toInt()
        return idx.coerceIn(0, half - 1)
    }

    override fun onCatalystInstanceDestroy() {
        Log.d(TAG, "Bridge dihancurkan")
    }
}
