package com.pristineaudio

import com.facebook.react.bridge.*
import android.util.Log

class NativeVisualizerBridge(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private var nativeAvailable = false

    companion object {
        private const val TAG = "NativeVisualizerBridge"
    }

    init {
        nativeAvailable = try {
            System.loadLibrary("pristineaudio_engine")
            Log.d(TAG, "Native engine loaded for visualizer")
            true
        } catch (e: UnsatisfiedLinkError) {
            Log.w(TAG, "Native engine tidak tersedia, visualizer akan disabled: ${e.message}")
            false
        }
    }

    override fun getName() = "NativeVisualizerBridge"

    private external fun getVisualizerData(): FloatArray

    @ReactMethod
    fun getFFTData(promise: Promise) {
        if (!nativeAvailable) {
            // Return empty array agar UI tidak crash
            promise.resolve(Arguments.createArray())
            return
        }
        try {
            val data = getVisualizerData()
            val array = Arguments.createArray()
            for (value in data) {
                array.pushDouble(value.toDouble())
            }
            promise.resolve(array)
        } catch (e: Exception) {
            Log.e(TAG, "getFFTData error: ${e.message}")
            promise.resolve(Arguments.createArray())
        }
    }
}
