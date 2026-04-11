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

    // Each effect tracks its own session ID independently.
    // Previously a single `currentSessionId` was shared, so recreating
    // one effect (e.g. EQ) would silently invalidate the others.
    private var eqSessionId: Int = -1
    private var bassSessionId: Int = -1
    private var virtSessionId: Int = -1
    private var reverbSessionId: Int = -1

    override fun getName(): String = "NativeDSPModule"

    // ─────────────────────────────────────────────
    // Audio Session ID
    // ─────────────────────────────────────────────

    /**
     * Returns the audio session ID currently held by any active effect,
     * or -1 if no effects have been initialised yet.
     *
     * JS side calls this to verify DSP is attached to a real session before
     * applying effects.  Previously this method did not exist, causing the
     * "No method available to get audio session ID" warning every track.
     */
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
    
    /**
 * Query AudioManager untuk mendapatkan active audio session ID
 * dari stream yang sedang playing — tidak bergantung pada effects.
 */
   @ReactMethod
   fun getActiveAudioSessionId(promise: Promise) {
    try {
        val am = reactApplicationContext
            .getSystemService(Context.AUDIO_SERVICE) as AudioManager
        
        // API 26+: query active playback sessions
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            val configs = am.getActivePlaybackConfigurations()
            val sessionId = configs
                .mapNotNull { it.audioSessionId.takeIf { id -> id > 0 } }
                .firstOrNull() ?: -1
            promise.resolve(sessionId)
        } else {
            // Fallback API < 26: kembalikan -1, JS akan skip
            promise.resolve(-1)
        }
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
            val eq = equalizer ?: throw IllegalStateException("Equalizer not initialised")
            val bandsToApply = minOf(gains.size(), eq.numberOfBands.toInt())
            for (i in 0 until bandsToApply) {
                eq.setBandLevel(i.toShort(), gains.getDouble(i).toInt().toShort())
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("EQ_ERROR", e.message ?: "Failed to set full equalizer", e)
        }
    }

    // Alias used by JS fallback path
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
        if (equalizer == null || eqSessionId != id) {
            equalizer?.release()
            equalizer = Equalizer(0, id).apply { enabled = true }
            eqSessionId = id
        }
    }

    private fun ensureBassBoost(id: Int) {
        if (bassBoost == null || bassSessionId != id) {
            bassBoost?.release()
            bassBoost = BassBoost(0, id).apply { enabled = true }
            bassSessionId = id
        }
    }

    private fun ensureVirtualizer(id: Int) {
        if (virtualizer == null || virtSessionId != id) {
            virtualizer?.release()
            virtualizer = Virtualizer(0, id).apply { enabled = true }
            virtSessionId = id
        }
    }

    private fun ensureReverb(id: Int) {
        if (presetReverb == null || reverbSessionId != id) {
            presetReverb?.release()
            presetReverb = PresetReverb(0, id).apply { enabled = true }
            reverbSessionId = id
        }
    }

    private fun releaseAll() {
        equalizer?.release();   equalizer = null;   eqSessionId = -1
        bassBoost?.release();   bassBoost = null;   bassSessionId = -1
        virtualizer?.release(); virtualizer = null; virtSessionId = -1
        presetReverb?.release(); presetReverb = null; reverbSessionId = -1
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
