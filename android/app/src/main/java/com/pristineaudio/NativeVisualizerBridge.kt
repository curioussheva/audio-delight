package com.pristineaudio

import android.media.audiofx.Visualizer
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class NativeVisualizerBridge(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "NativeVisualizerBridge"
        private const val EVENT_FFT_DATA = "onFftData"
        private const val NUM_BINS = 128
    }

    private var visualizer: Visualizer? = null
    private val reactContext = reactContext

    override fun getName(): String = "NativeVisualizerBridge"

    override fun invalidate() {
        releaseVisualizer()
        super.invalidate()
    }

    // =========================================================================
    // Public React Methods
    // =========================================================================

    @ReactMethod
    fun startVisualizer(audioSessionId: Int, promise: Promise) {
        try {
            Log.d(TAG, "startVisualizer: sessionId=$audioSessionId")

            // Bersihkan instance lama sebelum membuat baru
            releaseVisualizer()

            visualizer = Visualizer(audioSessionId).apply {
                // Gunakan capture size maksimum untuk resolusi terbaik
                captureSize = Visualizer.getCaptureSizeRange()[1]

                setDataCaptureListener(
                    createCaptureListener(),
                    Visualizer.getMaxCaptureRate() / 2,
                    false,  // waveform: tidak dipakai
                    true    // fft: aktif
                )

                enabled = true
            }

            Log.d(TAG, "Visualizer started — captureSize=${visualizer?.captureSize}")
            promise.resolve(true)

        } catch (e: Exception) {
            Log.e(TAG, "startVisualizer failed: ${e.message}")
            promise.reject("ERR_VISUALIZER", e.message ?: "Unknown error")
        }
    }

    @ReactMethod
    fun stopVisualizer() {
        Log.d(TAG, "stopVisualizer called")
        releaseVisualizer()
    }

    // Required boilerplate untuk NativeEventEmitter di JS side
    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}

    // =========================================================================
    // Private Helpers
    // =========================================================================

    /**
     * Lepaskan Visualizer instance dengan aman.
     * Selalu disable sebelum release untuk menghindari IllegalStateException.
     */
    private fun releaseVisualizer() {
        visualizer?.let {
            try {
                it.enabled = false
                it.release()
                Log.d(TAG, "Visualizer released")
            } catch (e: Exception) {
                Log.w(TAG, "Error releasing visualizer: ${e.message}")
            }
        }
        visualizer = null
    }

    /**
     * Buat listener FFT.
     * Data dari Android sudah dalam domain frekuensi (FFT),
     * kita hanya perlu hitung magnitude dari komponen real+imaginer.
     */
    private fun createCaptureListener(): Visualizer.OnDataCaptureListener {
        return object : Visualizer.OnDataCaptureListener {
            override fun onWaveFormDataCapture(
                v: Visualizer?,
                waveform: ByteArray?,
                samplingRate: Int
            ) {
                // Tidak dipakai — hanya FFT yang dibutuhkan visualizer
            }

            override fun onFftDataCapture(
                v: Visualizer?,
                fft: ByteArray?,
                samplingRate: Int
            ) {
                fft?.let { sendFftToJs(it) }
            }
        }
    }

    /**
     * Proses raw FFT bytes → normalized log-scaled bins → kirim ke JS.
     *
     * Format FFT dari Android Visualizer:
     * - Index 0: DC component (real)
     * - Index 1: Nyquist component (real)
     * - Index 2n, 2n+1: real dan imaginer untuk bin ke-n
     *
     * Output: 128 nilai float 0.0–1.0, log-scaled untuk persepsi natural.
     */
    private fun sendFftToJs(fft: ByteArray) {
    val data = Arguments.createArray()
    
    // Hitung magnitude untuk setiap bin yang diinginkan
    val magnitudes = DoubleArray(NUM_BINS)
    var maxMag = 0.0
    
    // Mulai dari indeks 2 untuk melewatkan DC component (opsional, bisa disesuaikan)
    // Format FFT Android: [0]=DC real, [1]=DC imag? Sebenarnya dokumentasi menyebutkan
    // index 0 adalah DC (real), index 1 adalah Nyquist (real), lalu berpasangan real/imaginer.
    // Untuk keamanan, kita ambil semua bin mulai dari indeks 2.
    for (i in 0 until NUM_BINS) {
        // Setiap bin frekuensi membutuhkan 2 byte: real dan imaginer
        val baseIdx = 2 + i * 2
        if (baseIdx + 1 >= fft.size) break
        
        // Konversi byte ke unsigned integer (0-255)
        val re = fft[baseIdx].toInt() and 0xFF
        val im = fft[baseIdx + 1].toInt() and 0xFF
        
        // Magnitude = sqrt(re^2 + im^2)
        val mag = Math.sqrt((re * re + im * im).toDouble())
        magnitudes[i] = mag
        if (mag > maxMag) maxMag = mag
    }
    
    // Log maksimum untuk debugging (setiap ~20 frame agar tidak spam)
    if (System.currentTimeMillis() % 20 == 0L) {
        Log.d(TAG, "FFT max magnitude: $maxMag, sample[0]=${magnitudes[0]}")
    }
    
    // Normalisasi dan scaling
    if (maxMag > 0.0) {
        for (i in 0 until NUM_BINS) {
            val normalized = (magnitudes[i] / maxMag).coerceIn(0.0, 1.0)
            // Skala logaritmik untuk persepsi pendengaran manusia
            // log10(1 + 9*x) memberikan rentang yang baik
            val scaled = Math.log10(1.0 + 9.0 * normalized)
            data.pushDouble(scaled)
        }
    } else {
        // Jika semua magnitude nol, kirim array nol
        for (i in 0 until NUM_BINS) {
            data.pushDouble(0.0)
        }
    }
    
    // Kirim event ke JavaScript
    reactContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(EVENT_FFT_DATA, data)
}
}

