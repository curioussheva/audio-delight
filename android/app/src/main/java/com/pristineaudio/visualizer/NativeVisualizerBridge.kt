package com.pristineaudio.visualizer

import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import android.util.Log
import com.pristineaudio.NativeLibrary

/**
 * Jembatan visualizer: sample audio dari engine C++ -> 128 bin spektrum -> JS.
 *
 * ## Rantai data
 *
 * ```
 * AudioCallback (C++, audio thread)
 *   -> VisualizerBuffer.write()          mono mixdown, ring buffer 2048
 *   -> EngineManager::engine().getVisualizerData()   (UI thread)
 *   -> JNI getSpectrumData                Hann + FFT 2048 (FFTProcessor /
 *        FFTPlan C++) + 128 bin log-scaled, di C++
 *   -> JS: getFFTData() -> number[128]
 * ```
 *
 * ## Kenapa FFT-nya di C++ (E1, 2026-11-19)
 *
 * Dulu FFT 2048 + log-bins dihitung di sini (Kotlin) di thread bridge tiap
 * poll — itu beban yang membuat poll 100 ms terasa berat dan jadi alasan
 * eksperimen B 2026-11-13 menaikkan poll 50 -> 100. Sekarang
 * `NativeVisualizerModule.cpp::getSpectrumData` menghitung semuanya di
 * C++ (FFTProcessor + FFTPlan, tabel twiddle/bit-reversal sekali di
 * konstruktor, tanpa alokasi per tick) dan kelas ini cukup meneruskan
 * hasilnya — bagian FFT Kotlin dihapus tanpa mengubah kontrak ke JS
 * (tetap 128 bin, 0.0-1.0, skala dBFS -80..0, bin log 20 Hz..Nyquist
 * stream). Tap tetap sesudah DSP; yang pindah hanya tempat FFT dihitung.
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

    // 🔥 LAZY LOAD (2026-11-10): dulu `nativeAvailable` di-set di init via
    // System.loadLibrary — memuat ~40MB .so di main thread saat cold start.
    // Sekarang tiap akses memicu NativeLibrary.ensureLoaded(): load terjadi
    // saat pertama kali dibutuhkan (JS thread), hasilnya di-cache. Semua
    // `if (!nativeAvailable)` di bawah tidak berubah.
    private val nativeAvailable: Boolean
        get() = NativeLibrary.ensureLoaded()

    companion object {
        const val NAME = "NativeVisualizerBridge"
        private const val TAG = "NativeVisualizerBridge"

        /** Jumlah bin yang dikirim ke JS. Dipertahankan agar cocok dengan fft.ts. */
        private const val OUTPUT_BINS = 128
    }

    override fun getName() = NAME

    // E1 (2026-11-19): satu FloatArray(128) yang dipakai ulang tiap
    // panggilan getFFTData(). JNI getSpectrumData hanya mengisinya via
    // SetFloatArrayRegion (tanpa NewFloatArray per panggilan) — pola yang
    // sama dengan B12-W9 dulu, tapi kini isinya 128 bin JADI, bukan 2048
    // sample mentah. FFT_SIZE 2048 + skala dB -80..0 kini hidup di C++
    // (NativeVisualizerModule.cpp).
    //
    // Thread-safety: pemanggil satu-satunya adalah poller VisualizerService
    // (satu setInterval, await), dan @ReactMethod dieksekusi berurutan di
    // JS thread — jadi tidak ada dua pemanggil bersamaan dalam praktik.
    // Pengisian tetap dibungkus synchronized(samplesLock) sebagai
    // defense-in-depth, karena array ini dipakai ulang.
    private val spectrumBins = FloatArray(OUTPUT_BINS)
    private val samplesLock = Any()

    // JNI: baca ring VisualizerBuffer + Hann + FFT 2048 + 128 bin log di
    // C++, isi `out` (FloatArray(128), 0.0-1.0). Menggantikan pasangan
    // getVisualizerData + getActualSampleRate + FFT Kotlin (dihapus E1).
    private external fun getSpectrumData(out: FloatArray)

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
            // E1: spektrum dihitung di C++ (getSpectrumData) — Kotlin hanya
            // meneruskan 128 bin jadi ke JS. Kontrak tidak berubah:
            // getFFTData() tetap Promise<number[128]>.
            val bins: FloatArray = synchronized(samplesLock) {
                getSpectrumData(spectrumBins)
                spectrumBins
            }

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

    override fun onCatalystInstanceDestroy() {
        Log.d(TAG, "Bridge dihancurkan")
    }
}
