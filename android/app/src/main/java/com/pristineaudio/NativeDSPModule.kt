package com.pristineaudio

import android.content.Context
import android.media.AudioManager
import android.media.audiofx.BassBoost
import android.media.audiofx.PresetReverb
import com.facebook.react.bridge.*

class NativeDSPModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private var bassBoost: BassBoost? = null
    private var presetReverb: PresetReverb? = null
    private var currentSessionId: Int = -1

    override fun getName(): String = "NativeDSPModule"

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for NativeEventEmitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for NativeEventEmitter
    }

    @ReactMethod
    fun toggleExclusiveMode(enabled: Boolean, promise: Promise) {
        try {
            val audioManager = reactApplicationContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            if (enabled) {
                audioManager.setParameters("hifi_mode=on")
                audioManager.setParameters("dac_direct=on")
            } else {
                audioManager.setParameters("hifi_mode=off")
                audioManager.setParameters("dac_direct=off")
            }
            promise.resolve(enabled)
        } catch (e: Exception) {
            promise.reject("DSP_ERROR", e.message)
        }
    }

    @ReactMethod
    fun setBassBoost(strength: Int, audioSessionId: Int, promise: Promise) {
        try {
            if (audioSessionId <= 0) {
                promise.reject("BASS_ERROR", "Invalid Audio Session ID")
                return
            }

            if (bassBoost == null || currentSessionId != audioSessionId) {
                bassBoost?.release()
                bassBoost = BassBoost(0, audioSessionId)
                currentSessionId = audioSessionId
            }

            bassBoost?.enabled = strength > 0
            if (strength > 0) {
                bassBoost?.setStrength(strength.toShort())
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("BASS_ERROR", e.message)
        }
    }

    @ReactMethod
    fun setReverbPreset(preset: Int, audioSessionId: Int, promise: Promise) {
        try {
            if (audioSessionId <= 0) {
                promise.reject("REVERB_ERROR", "Invalid Audio Session ID")
                return
            }

            if (presetReverb == null || currentSessionId != audioSessionId) {
                presetReverb?.release()
                presetReverb = PresetReverb(0, audioSessionId)
                currentSessionId = audioSessionId
            }

            presetReverb?.enabled = preset > 0
            if (preset > 0) {
                presetReverb?.preset = preset.toShort()
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("REVERB_ERROR", e.message)
        }
    }

    @ReactMethod
    fun getHardwareSampleRate(promise: Promise) {
        val audioManager = reactApplicationContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val sampleRate = audioManager.getProperty(AudioManager.PROPERTY_OUTPUT_SAMPLE_RATE)
        promise.resolve(sampleRate?.toInt() ?: 44100)
    }

    @ReactMethod
    fun releaseAllFX(promise: Promise) {
        try {
            bassBoost?.release()
            presetReverb?.release()
            bassBoost = null
            presetReverb = null
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("RELEASE_ERROR", e.message)
        }
    }
}
 