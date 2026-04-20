package com.pristineaudio

import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
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
    fun getFFTData(promise: Promise) {
        if (!nativeAvailable) {
            promise.resolve(Arguments.createArray())
            return
        }
        try {
            val data = getVisualizerData()
            val array = Arguments.createArray()
            for (value in data) array.pushDouble(value.toDouble())
            promise.resolve(array)
        } catch (e: Exception) {
            Log.e(TAG, "getFFTData error: ${e.message}")
            promise.resolve(Arguments.createArray())
        }
    }
}
