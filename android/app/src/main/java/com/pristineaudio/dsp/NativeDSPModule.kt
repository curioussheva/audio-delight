package com.pristineaudio.dsp

import android.content.Context
import android.media.AudioManager
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = NativeDSPModule.NAME)
class NativeDSPModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private var engineAvailable = false

    companion object {
        const val NAME = "NativeDSPModule"
        private const val TAG = "NativeDSPModule"
    }

    init {
        engineAvailable = try {
            System.loadLibrary("pristine-audio")
            Log.d(TAG, "pristine-audio loaded")
            true
        } catch (e: UnsatisfiedLinkError) {
            Log.e(TAG, "Native library tidak tersedia: ${e.message}")
            false
        } catch (e: Exception) {
            Log.e(TAG, "Engine boot gagal: ${e.message}")
            false
        }
    }

    override fun getName() = NAME

    // ===================== JNI EXTERNAL FUNCTIONS =====================

    private external fun setNativeMasterGain(gain: Float)
    private external fun setNativeStereoWide(width: Float)
    private external fun setNativeEqualizerBand(band: Int, gain: Float)
    private external fun setNativeBassBoost(gain: Float)
    private external fun setNativeBalance(balance: Float)
    private external fun toggleNativeExclusiveMode(enabled: Boolean)

    // Additional JNI functions (were missing before)
    private external fun setNativeDSPEnabled(enabled: Boolean)
    private external fun setNativeLimiterEnabled(enabled: Boolean)
    private external fun setNativeSolfeggioFreq(freq: Float)
    private external fun setNativeBrainwaveFreq(freq: Float)
    private external fun setNativeResonanceIntensity(intensity: Float)
    private external fun setNativeImmersiveEnabled(enabled: Boolean)

    // ===================== REACT METHODS =====================

    @ReactMethod
    fun setEqualizer(band: Int, level: Float, sessionId: Int, promise: Promise) {
        if (!engineAvailable) { promise.resolve(false); return }
        try {
            setNativeEqualizerBand(band, level)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("DSP_ERROR", e.message)
        }
    }

    @ReactMethod
    fun setFullEqualizer(gains: ReadableArray, sessionId: Int, promise: Promise) {
        if (!engineAvailable) { promise.resolve(false); return }
        try {
            for (i in 0 until minOf(gains.size(), 10)) {
                setNativeEqualizerBand(i, gains.getDouble(i).toFloat())
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("DSP_ERROR", e.message)
        }
    }

    @ReactMethod
    fun setBassBoost(strength: Float, sessionId: Int, promise: Promise) {
        if (!engineAvailable) { promise.resolve(false); return }
        try {
            setNativeBassBoost(strength)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("DSP_ERROR", e.message)
        }
    }

    @ReactMethod
    fun setVirtualizer(strength: Float, sessionId: Int, promise: Promise) {
        if (!engineAvailable) { promise.resolve(false); return }
        try {
            setNativeStereoWide(strength / 1000.0f)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("DSP_ERROR", e.message)
        }
    }

    @ReactMethod
    fun setReverbPreset(preset: Int, sessionId: Int, promise: Promise) {
        // Reverb tidak didukung oleh engine C++ saat ini
        promise.resolve(false)
    }

    @ReactMethod
    fun releaseAllFX(promise: Promise) {
        // Tidak ada alokasi efek khusus; bisa dianggap sukses
        promise.resolve(true)
    }

    @ReactMethod
    fun createAudioSession(promise: Promise) {
        try {
            val sessionId = generateAudioSessionId()
            val result = Arguments.createMap()
            result.putInt("sessionId", sessionId)
            result.putBoolean("isNew", true)
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("DSP_ERROR", e.message)
        }
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

    // ===================== ADDITIONAL REACT METHODS =====================

    @ReactMethod
    fun setDSPEnabled(enabled: Boolean) {
        if (engineAvailable) setNativeDSPEnabled(enabled)
    }

    @ReactMethod
    fun setLimiterEnabled(enabled: Boolean) {
        if (engineAvailable) setNativeLimiterEnabled(enabled)
    }

    @ReactMethod
    fun setSolfeggioFreq(freq: Float) {
        if (engineAvailable) setNativeSolfeggioFreq(freq)
    }

    @ReactMethod
    fun setBrainwaveFreq(freq: Float) {
        if (engineAvailable) setNativeBrainwaveFreq(freq)
    }

    @ReactMethod
    fun setResonanceIntensity(intensity: Float) {
        if (engineAvailable) setNativeResonanceIntensity(intensity)
    }

    @ReactMethod
    fun setImmersiveEnabled(enabled: Boolean) {
        if (engineAvailable) setNativeImmersiveEnabled(enabled)
    }

    // ===================== PRIVATE HELPER =====================

    private fun generateAudioSessionId(): Int {
        val audioManager = reactApplicationContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        return audioManager.generateAudioSessionId()
    }
}