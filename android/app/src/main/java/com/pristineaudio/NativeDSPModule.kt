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

    /**
     * Mengaktifkan/Matikan Parameter Hardware Khusus (Vendor-specific)
     */
    @ReactMethod
    fun toggleExclusiveMode(enabled: Boolean, promise: Promise) {
        try {
            val audioManager = reactApplicationContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            if (enabled) {
                // Parameter umum untuk beberapa chip DAC onboard (seperti LG/Vivo/Samsung)
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

    /**
     * Bass Boost Implementation
     * @param strength 0 to 1000
     */
    @ReactMethod
    fun setBassBoost(strength: Int, audioSessionId: Int, promise: Promise) {
        try {
            if (audioSessionId <= 0) {
                promise.reject("BASS_ERROR", "Invalid Audio Session ID")
                return
            }

            // Inisialisasi ulang jika Session ID berubah
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

    /**
     * Preset Reverb Implementation
     * @param preset 0: None, 1: SmallRoom, 2: MediumRoom, 3: LargeRoom, 4: MediumHall, 5: LargeHall, 6: Plate
     */
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

            // Preset 0 di Android biasanya 'None'
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

    // Dipanggil saat aplikasi dimatikan atau saat user memilih 'Bit-Perfect' (Direct)
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
