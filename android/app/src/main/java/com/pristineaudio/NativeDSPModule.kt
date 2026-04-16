package com.pristineaudio.app

import com.facebook.react.bridge.*
import android.util.Log

class NativeDSPModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "NativeDSPModule"

    companion object {
        init {
            try {
                System.loadLibrary("pristineaudio_engine")
                Log.d("NativeDSP", "Oboe Engine Library Loaded")
            } catch (e: Exception) {
                Log.e("NativeDSP", "Failed to load C++ library: ${e.message}")
            }
        }
    }

    // ─────────────────────────────────────────────
    // JNI Bridge (Menghubungkan ke C++)
    // ─────────────────────────────────────────────
    private external fun setNativeEqualizerBand(bandIndex: Int, gain: Float)
    private external fun setNativeBassBoost(intensity: Float)
    private external fun setNativeVirtualizer(intensity: Float)
    private external fun toggleNativeExclusiveMode(enabled: Boolean)

    // ─────────────────────────────────────────────
    // React Methods
    // ─────────────────────────────────────────────

    @ReactMethod
    fun setEqualizerBand(band: Int, gain: Float, promise: Promise) {
        try {
            setNativeEqualizerBand(band, gain)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("DSP_ERROR", e.message)
        }
    }

    @ReactMethod
    fun setFullEqualizer(gains: ReadableArray, promise: Promise) {
        try {
            for (i in 0 until gains.size()) {
                setNativeEqualizerBand(i, gains.getDouble(i).toFloat())
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("DSP_ERROR", e.message)
        }
    }

    @ReactMethod
    fun setBassBoost(intensity: Float, promise: Promise) {
        try {
            // Intensity biasanya 0.0 sampai 1.0 (atau 0-100 di UI)
            setNativeBassBoost(intensity)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("DSP_ERROR", e.message)
        }
    }

    @ReactMethod
    fun toggleExclusiveMode(enabled: Boolean, promise: Promise) {
        try {
            toggleNativeExclusiveMode(enabled)
            promise.resolve(enabled)
        } catch (e: Exception) {
            promise.reject("DSP_ERROR", e.message)
        }
    }
}
