package com.pristineaudio

import com.facebook.react.bridge.*

class NativeVisualizerModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    override fun getName() = "NativeVisualizerModule"

    private external fun getVisualizerData(): FloatArray

    @ReactMethod
    fun getFFTData(promise: Promise) {
        try {
            val data = getVisualizerData()
            val array = Arguments.createArray()
            for (value in data) {
                array.pushDouble(value.toDouble())
            }
            promise.resolve(array)
        } catch (e: Exception) {
            promise.reject("VISUALIZER_ERROR", e.message)
        }
    }
}
 