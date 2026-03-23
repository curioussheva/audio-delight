package com.pristineaudio

import android.media.audiofx.Visualizer
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class NativeVisualizerBridge(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private var visualizer: Visualizer? = null
    private val context = reactContext

    override fun getName(): String = "NativeVisualizerBridge"

    @ReactMethod
    fun startVisualizer(audioSessionId: Int, promise: Promise) {
        try {
            if (audioSessionId == 0) {
                promise.reject("ERR_SESSION", "Invalid Session ID")
                return
            }

            stopVisualizer()

            visualizer = Visualizer(audioSessionId).apply {
                captureSize = Visualizer.getCaptureSizeRange()[1]
                setDataCaptureListener(object : Visualizer.OnDataCaptureListener {
                    override fun onWaveFormDataCapture(v: Visualizer?, waveform: ByteArray?, samplingRate: Int) {
                        // Not used
                    }

                    override fun onFftDataCapture(v: Visualizer?, fft: ByteArray?, samplingRate: Int) {
                        if (fft != null) {
                            sendFftToJs(fft)
                        }
                    }
                }, Visualizer.getMaxCaptureRate() / 2, false, true)
                enabled = true
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_VISUALIZER", e.message)
        }
    }

    @ReactMethod
    fun stopVisualizer() {
        visualizer?.enabled = false
        visualizer?.release()
        visualizer = null
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for NativeEventEmitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for NativeEventEmitter
    }

    private fun sendFftToJs(fft: ByteArray) {
        val data = Arguments.createArray()
        val numBins = 128

        for (i in 0 until numBins) {
            val rIndex = (i + 1) * 2
            if (rIndex + 1 >= fft.size) break

            val re = fft[rIndex].toDouble()
            val im = fft[rIndex + 1].toDouble()
            val magnitude = Math.sqrt(re * re + im * im)
            val normalized = (magnitude / 128.0).coerceIn(0.0, 1.0)
            val db = if (normalized > 0) Math.log10(1.0 + 9.0 * normalized) else 0.0

            data.pushDouble(db)
        }

        context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("onFftData", data)
    }
} 