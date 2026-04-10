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

        for (i in 0 until NUM_BINS) {
            val rIndex = (i + 1) * 2
            if (rIndex + 1 >= fft.size) break

            val re = fft[rIndex].toDouble()
            val im = fft[rIndex + 1].toDouble()

            // Magnitude dari komponen kompleks
            val magnitude = Math.sqrt(re * re + im * im)

            // Normalize ke 0.0–1.0
            val normalized = (magnitude / 128.0).coerceIn(0.0, 1.0)

            // Log scaling untuk kompensasi sensitivitas telinga manusia
            // log10(1 + 9x) memberikan kurva yang natural secara perseptual
            val db = if (normalized > 0) Math.log10(1.0 + 9.0 * normalized) else 0.0

            data.pushDouble(db)
        }

        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(EVENT_FFT_DATA, data)
    }
} 