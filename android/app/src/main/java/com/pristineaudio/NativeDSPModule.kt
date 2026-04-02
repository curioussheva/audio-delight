package com.pristineaudio

import android.content.Context
import android.media.AudioManager
import android.media.audiofx.*
import com.facebook.react.bridge.*

class NativeDSPModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private var bassBoost: BassBoost? = null
    private var presetReverb: PresetReverb? = null
    private var equalizer: Equalizer? = null
    private var virtualizer: Virtualizer? = null // Penambahan Sound Stage
    private var currentSessionId: Int = -1

    override fun getName(): String = "NativeDSPModule"

    // --- Equalizer ---
    @ReactMethod
    fun setEqualizer(band: Int, level: Int, audioSessionId: Int, promise: Promise) {
        try {
            ensureEqualizer(audioSessionId)
            // Konversi dB ke mB (milliBels) sudah dilakukan di sisi JS (gains * 100)
            equalizer?.setBandLevel(band.toShort(), level.toShort())
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("EQ_ERROR", e.message)
        }
    }
    
    @ReactMethod
    fun setFullEqualizer(gains: ReadableArray, audioSessionId: Int, promise: Promise) {
    try {
        ensureEqualizer(audioSessionId)
        val eq = equalizer!!
        val bandsToApply = if (gains.size() < eq.numberOfBands.toInt()) gains.size() else eq.numberOfBands.toInt()
        
        for (i in 0 until bandsToApply) {
            val level = (gains.getDouble(i)).toInt().toShort()
            eq.setBandLevel(i.toShort(), level)
        }
        promise.resolve(true)
    } catch (e: Exception) {
        promise.reject("EQ_ERROR", e.message)
    }
}
 
    // --- Bass Boost ---
    @ReactMethod
    fun setBassBoost(strength: Int, audioSessionId: Int, promise: Promise) {
        try {
            ensureBassBoost(audioSessionId)
            bassBoost?.enabled = strength > 0
            if (strength > 0) bassBoost?.setStrength(strength.toShort())
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("BASS_ERROR", e.message)
        }
    }

    // --- Virtualizer (Sound Stage) ---
    @ReactMethod
    fun setVirtualizer(strength: Int, audioSessionId: Int, promise: Promise) {
        try {
            ensureVirtualizer(audioSessionId)
            virtualizer?.enabled = strength > 0
            if (strength > 0) virtualizer?.setStrength(strength.toShort())
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("VIRT_ERROR", e.message)
        }
    }

    // --- Reverb ---
    @ReactMethod
    fun setReverbPreset(preset: Int, audioSessionId: Int, promise: Promise) {
        try {
            ensureReverb(audioSessionId)
            presetReverb?.enabled = preset > 0
            if (preset > 0) presetReverb?.preset = preset.toShort()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("REVERB_ERROR", e.message)
        }
    }

    // --- Helper for Lazy Loading ---
    private fun ensureEqualizer(id: Int) {
        if (equalizer == null || currentSessionId != id) {
            equalizer?.release()
            equalizer = Equalizer(0, id).apply { enabled = true }
            currentSessionId = id
        }
    }

    private fun ensureBassBoost(id: Int) {
        if (bassBoost == null || currentSessionId != id) {
            bassBoost?.release()
            bassBoost = BassBoost(0, id)
            currentSessionId = id
        }
    }

    private fun ensureVirtualizer(id: Int) {
        if (virtualizer == null || currentSessionId != id) {
            virtualizer?.release()
            virtualizer = Virtualizer(0, id)
            currentSessionId = id
        }
    }

    private fun ensureReverb(id: Int) {
        if (presetReverb == null || currentSessionId != id) {
            presetReverb?.release()
            presetReverb = PresetReverb(0, id)
            currentSessionId = id
        }
    }

    @ReactMethod
    fun releaseAllFX(promise: Promise) {
        try {
            equalizer?.release(); equalizer = null
            bassBoost?.release(); bassBoost = null
            presetReverb?.release(); presetReverb = null
            virtualizer?.release(); virtualizer = null
            currentSessionId = -1
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("RELEASE_ERROR", e.message)
        }
    }

    @ReactMethod
    fun toggleExclusiveMode(enabled: Boolean, promise: Promise) {
        try {
            val audioManager = reactApplicationContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            if (enabled) {
                audioManager.setParameters("hifi_mode=on;dac_direct=on")
            } else {
                audioManager.setParameters("hifi_mode=off;dac_direct=off")
            }
            promise.resolve(enabled)
        } catch (e: Exception) {
            promise.reject("DSP_ERROR", e.message)
        }
    }

    override fun invalidate() {
        releaseAllFX(null as? Promise ?: object : Promise {
            override fun resolve(value: Any?) {}
            override fun reject(code: String, message: String?) {}
            override fun reject(code: String, throwable: Throwable?) {}
            override fun reject(code: String, message: String?, throwable: Throwable?) {}
            override fun reject(throwable: Throwable?) {}
        })
        super.invalidate()
    }
}
