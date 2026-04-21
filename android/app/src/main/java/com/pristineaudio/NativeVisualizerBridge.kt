package com.pristineaudio

import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import android.media.audiofx.Visualizer
import android.util.Log

@ReactModule(name = NativeVisualizerBridge.NAME)
class NativeVisualizerBridge(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private var nativeAvailable = false
    private var visualizer: Visualizer? = null

    companion object {
        const val NAME = "NativeVisualizerBridge"
        private const val TAG = "NativeVisualizerBridge"
    }

    init {
        nativeAvailable = try {
            System.loadLibrary("pristineaudio_engine")
            Log.d(TAG, "Native engine loaded for visualizer")
            true
        } catch (e: UnsatisfiedLinkError) {
            Log.w(TAG, "Native engine tidak tersedia: ${e.message}")
            false
        }
    }

    override fun getName() = NAME

    private external fun getVisualizerData(): FloatArray

    @ReactMethod
    fun startVisualizer(audioSessionId: Int, promise: Promise) {
        try {
            visualizer?.release()
            visualizer = Visualizer(audioSessionId).apply {
                captureSize = Visualizer.getCaptureSizeRange()[1]
                enabled = true
            }
            Log.d(TAG, "Visualizer started for session $audioSessionId")
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Visualizer start failed: ${e.message}")
            promise.reject("VISUALIZER_ERROR", "Cannot initialize Visualizer engine, error: ${e.message}")
        }
    }

    @ReactMethod
    fun stopVisualizer() {
        try {
            visualizer?.release()
            visualizer = null
            Log.d(TAG, "Visualizer stopped")
        } catch (e: Exception) {
        }
    }

    @ReactMethod
    fun getFFTData(promise: Promise) {
        val vis = visualizer
        if (vis == null || !vis.enabled) {
            promise.resolve(Arguments.createArray())
            return
        }
        try {
            val fft = ByteArray(vis.captureSize)
            vis.getFft(fft)
            val array = Arguments.createArray()
            for (value in fft) array.pushDouble(value.toDouble())
            promise.resolve(array)
        } catch (e: Exception) {
            Log.e(TAG, "getFFTData error: ${e.message}")
            promise.resolve(Arguments.createArray())
        }
    }

    override fun onCatalystInstanceDestroy() {
        visualizer?.release()
        visualizer = null
    }
}
