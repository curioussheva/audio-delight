package com.pristineaudio

import android.content.Context
import android.media.AudioManager
import android.media.audiofx.*
import com.facebook.react.bridge.*

class NativeDSPModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private var bassBoost: BassBoost? = null
    private var presetReverb: PresetReverb? = null
    private var equalizer: Equalizer? = null
    private var virtualizer: Virtualizer? = null

    private var eqSessionId: Int = -1
    private var bassSessionId: Int = -1
    private var virtSessionId: Int = -1
    private var reverbSessionId: Int = -1

    override fun getName(): String = "NativeDSPModule"

    // ─────────────────────────────────────────────
    // Audio Session ID
    // ─────────────────────────────────────────────

    @ReactMethod
    fun getAudioSessionId(promise: Promise) {
        val sessionId = when {
            eqSessionId > 0     -> eqSessionId
            bassSessionId > 0   -> bassSessionId
            virtSessionId > 0   -> virtSessionId
            reverbSessionId > 0 -> reverbSessionId
            else                -> -1
        }
        promise.resolve(sessionId)
    }

    @ReactMethod
    fun getActiveAudioSessionId(promise: Promise) {
        try {
            val existingId = when {
                eqSessionId > 0     -> eqSessionId
                bassSessionId > 0   -> bassSessionId
                virtSessionId > 0   -> virtSessionId
                reverbSessionId > 0 -> reverbSessionId
                else                -> -1
            }
            if (existingId > 0) {
                promise.resolve(existingId)
                return
            }
            val am = reactApplicationContext
                .getSystemService(Context.AUDIO_SERVICE) as AudioManager
            val newSessionId = am.generateAudioSessionId()
            promise.resolve(if (newSessionId == AudioManager.ERROR) -1 else newSessionId)
        } catch (e: Exception) {
            promise.resolve(-1)
        }
    }

    // ─────────────────────────────────────────────
    // Equalizer
    // ─────────────────────────────────────────────

    @ReactMethod
    fun setEqualizer(band: Int, level: Int, audioSessionId: Int, promise: Promise) {
        try {
            ensureEqualizer(audioSessionId)
            equalizer?.setBandLevel(band.toShort(), level.toShort())
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("EQ_ERROR", e.message ?: "Unknown equalizer error", e)
        }
    }

    @ReactMethod
    fun setFullEqualizer(gains: ReadableArray, audioSessionId: Int, promise: Promise) {
        try {
            ensureEqualizer(audioSessionId)
            val eq = equalizer ?: throw IllegalStateException("EQ not init")
            val numBands = eq.numberOfBands.toInt()

            for (i in 0 until minOf(gains.size(), numBands)) {
                val level = (gains.getDouble(i) * 100).toInt().toShort()
                android.util.Log.d("NativeDSP", "Band $i → ${gains.getDouble(i)} dB = $level mB")
                eq.setBandLevel(i.toShort(), level)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            android.util.Log.e("NativeDSP", "setFullEqualizer failed: ${e.message}")
            promise.reject("EQ_ERROR", e.message)
        }
    }

    @ReactMethod
    fun setBandLevel(band: Int, level: Int, audioSessionId: Int, promise: Promise) {
        setEqualizer(band, level, audioSessionId, promise)
    }

    // ─────────────────────────────────────────────
    // Bass Boost
    // ─────────────────────────────────────────────

    @ReactMethod
    fun setBassBoost(strength: Int, audioSessionId: Int, promise: Promise) {
        try {
            ensureBassBoost(audioSessionId)
            bassBoost?.apply {
                enabled = strength > 0
                if (strength > 0) setStrength(strength.toShort())
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("BASS_ERROR", e.message ?: "Bass boost error", e)
        }
    }

    // ─────────────────────────────────────────────
    // Virtualizer
    // ─────────────────────────────────────────────

    @ReactMethod
    fun setVirtualizer(strength: Int, audioSessionId: Int, promise: Promise) {
        try {
            ensureVirtualizer(audioSessionId)
            virtualizer?.apply {
                enabled = strength > 0
                if (strength > 0) setStrength(strength.toShort())
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("VIRT_ERROR", e.message ?: "Virtualizer error", e)
        }
    }

    // ─────────────────────────────────────────────
    // Reverb
    // ─────────────────────────────────────────────

    @ReactMethod
    fun setReverbPreset(preset: Int, audioSessionId: Int, promise: Promise) {
        try {
            ensureReverb(audioSessionId)
            presetReverb?.apply {
                enabled = preset > 0
                if (preset > 0) this.preset = preset.toShort()
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("REVERB_ERROR", e.message ?: "Reverb error", e)
        }
    }

    // ─────────────────────────────────────────────
    // Release / Cleanup
    // ─────────────────────────────────────────────

    @ReactMethod
    fun releaseAllFX(promise: Promise) {
        try {
            releaseAll()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("RELEASE_ERROR", e.message ?: "Failed to release FX", e)
        }
    }

    @ReactMethod
    fun reset(promise: Promise) {
        releaseAllFX(promise)
    }

    // ─────────────────────────────────────────────
    // Exclusive / Hi-Fi mode
    // ─────────────────────────────────────────────

    @ReactMethod
    fun toggleExclusiveMode(enabled: Boolean, promise: Promise) {
        try {
            val am = reactApplicationContext
                .getSystemService(Context.AUDIO_SERVICE) as AudioManager
            if (enabled) {
                am.setParameters("hifi_mode=on;dac_direct=on")
            } else {
                am.setParameters("hifi_mode=off;dac_direct=off")
            }
            promise.resolve(enabled)
        } catch (e: Exception) {
            promise.reject("DSP_ERROR", e.message ?: "Exclusive mode error", e)
        }
    }

    // ─────────────────────────────────────────────
    // Private helpers
    // ─────────────────────────────────────────────

    private fun ensureEqualizer(id: Int) {
        if (id <= 0 && id != 0) return
        if (equalizer != null && eqSessionId == id) return
        try {
            equalizer?.release()
            equalizer = Equalizer(1000, id).apply { enabled = true }
            eqSessionId = id
            android.util.Log.d("NativeDSP", "EQ Initialized on Session $id")
        } catch (e: Exception) {
            eqSessionId = -1
            android.util.Log.e("NativeDSPModule", "Failed to init EQ: ${e.message}")
        }
    }

    private fun ensureBassBoost(id: Int) {
        if (id <= 0) return
        if (bassBoost != null && bassSessionId == id) return
        try {
            bassBoost?.release()
            bassBoost = BassBoost(0, id).apply { enabled = true }
            bassSessionId = id
        } catch (e: Exception) {
            bassSessionId = -1
            android.util.Log.e("NativeDSPModule", "Failed to init Bass: ${e.message}")
        }
    }

    private fun ensureVirtualizer(id: Int) {
        if (id <= 0) return
        if (virtualizer != null && virtSessionId == id) return
        try {
            virtualizer?.release()
            virtualizer = Virtualizer(0, id).apply { enabled = true }
            virtSessionId = id
        } catch (e: Exception) {
            virtSessionId = -1
            android.util.Log.e("NativeDSPModule", "Failed to init Virtualizer: ${e.message}")
        }
    }

    private fun ensureReverb(id: Int) {
        if (id <= 0) return
        if (presetReverb != null && reverbSessionId == id) return
        try {
            presetReverb?.release()
            presetReverb = PresetReverb(0, id).apply { enabled = true }
            reverbSessionId = id
        } catch (e: Exception) {
            reverbSessionId = -1
            presetReverb = null
            android.util.Log.e("NativeDSP", "Reverb not supported on this device/session")
        }
    }

    private fun releaseAll() {
        try { equalizer?.release() } catch (e: Exception) {}
        equalizer = null; eqSessionId = -1

        try { bassBoost?.release() } catch (e: Exception) {}
        bassBoost = null; bassSessionId = -1

        try { virtualizer?.release() } catch (e: Exception) {}
        virtualizer = null; virtSessionId = -1

        try { presetReverb?.release() } catch (e: Exception) {}
        presetReverb = null; reverbSessionId = -1
    }

    override fun invalidate() {
        try {
            releaseAll()
        } catch (e: Exception) {
            android.util.Log.e("NativeDSPModule", "Cleanup failed: ${e.message}")
        }
        super.invalidate()
    }
}
 