package com.pristineaudio

import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import android.media.audiofx.Visualizer
import android.util.Log

@ReactModule(name = NativeVisualizerBridge.NAME)
class NativeVisualizerBridge(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private var nativeAvailable = false

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
    if (!nativeAvailable) {
        promise.resolve(Arguments.createArray())
        return
    }

    try {
        val data = getVisualizerData()
        val array = Arguments.createArray()
        data.forEach { array.pushDouble(it.toDouble()) }
        promise.resolve(array)
    } catch (e: Exception) {
        promise.resolve(Arguments.createArray())
    }
}

    override fun onCatalystInstanceDestroy() {
        visualizer?.release()
        visualizer = null
    }
}
