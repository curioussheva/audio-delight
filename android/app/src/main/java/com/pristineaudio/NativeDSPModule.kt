package com.pristineaudio

import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import android.util.Log

@ReactModule(name = NativeDSPModule.NAME)
class NativeDSPModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private var engineAvailable = false

    companion object {
        private const val TAG = "NativeDSPModule"
    }

    init {
        engineAvailable = try {
            System.loadLibrary("pristineaudio_engine")
            bootEngineNative()
            Log.d(TAG, "Oboe Engine booted successfully")
            true
        } catch (e: UnsatisfiedLinkError) {
            Log.e(TAG, "Native library tidak tersedia: ${e.message}")
            false
        } catch (e: Exception) {
            Log.e(TAG, "Engine boot gagal: ${e.message}")
            false
        }
    }

    companion object { const val NAME = "NativeDSPModule" }
    override fun getName() = NAME

    private external fun bootEngineNative()
    private external fun setNativeMasterGain(gain: Float)
    private external fun setNativeStereoWide(width: Float)
    private external fun setNativeEqualizerBand(band: Int, gain: Float)
    private external fun setNativeBassBoost(gain: Float)
    private external fun setNativeBalance(balance: Float)
    private external fun toggleNativeExclusiveMode(enabled: Boolean)

    @ReactMethod
    fun setEqualizer(band: Int, level: Float, sessionId: Int, promise: Promise) {
        if (!engineAvailable) { promise.resolve(false); return }
        try { setNativeEqualizerBand(band, level); promise.resolve(true) }
        catch (e: Exception) { promise.reject("DSP_ERROR", e.message) }
    }

    @ReactMethod
    fun setFullEqualizer(gains: ReadableArray, sessionId: Int, promise: Promise) {
        if (!engineAvailable) { promise.resolve(false); return }
        try {
            for (i in 0 until minOf(gains.size(), 10)) {
                setNativeEqualizerBand(i, gains.getDouble(i).toFloat())
            }
            promise.resolve(true)
        } catch (e: Exception) { promise.reject("DSP_ERROR", e.message) }
    }

    @ReactMethod
    fun setBassBoost(strength: Float, sessionId: Int, promise: Promise) {
        if (!engineAvailable) { promise.resolve(false); return }
        try { setNativeBassBoost(strength); promise.resolve(true) }
        catch (e: Exception) { promise.reject("DSP_ERROR", e.message) }
    }

    @ReactMethod
    fun setVirtualizer(strength: Float, sessionId: Int, promise: Promise) {
        if (!engineAvailable) { promise.resolve(false); return }
        try { setNativeStereoWide(strength / 1000.0f); promise.resolve(true) }
        catch (e: Exception) { promise.reject("DSP_ERROR", e.message) }
    }

    @ReactMethod
    fun setReverbPreset(preset: Int, sessionId: Int, promise: Promise) {
        promise.resolve(false)
    }

    @ReactMethod
    fun releaseAllFX(promise: Promise) {
        promise.resolve(true)
    }

    @ReactMethod
    fun createAudioSession(promise: Promise) {
        val result = Arguments.createMap()
        result.putInt("sessionId", 0)
        result.putBoolean("isNew", false)
        promise.resolve(result)
    }

    @ReactMethod
    fun setMasterGain(gain: Float) {
        if (engineAvailable) setNativeMasterGain(gain)
    }

    @ReactMethod
    fun setBalance(balance: Float) {
        if (engineAvailable) setNativeBalance(balance)
    }

    @ReactMethod
    fun setExclusiveMode(enabled: Boolean) {
        if (engineAvailable) toggleNativeExclusiveMode(enabled)
    }
}
