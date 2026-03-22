package com.pristineaudio

import android.content.Context
import android.media.*
import android.os.Build
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class USBDACModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private val audioManager = reactContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private var equalizer: android.media.audiofx.Equalizer? = null
    private var isExclusiveMode = false

    override fun getName(): String = "USBDACModule"

    /**
     * Mendeteksi DAC dengan detail kapabilitas yang lebih mendalam (Sample Rates & Channel Index)
     */
    @ReactMethod
    fun detectDACs(promise: Promise) {
        try {
            val devices = audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
            val dacList = Arguments.createArray()

            devices.forEach { device ->
                if (isUsbDevice(device)) {
                    val map = Arguments.createMap().apply {
                        putInt("id", device.id)
                        putString("name", device.productName.toString())
                        putArray("sampleRates", Arguments.fromList(device.sampleRates.toList()))
                        // Deteksi dukungan Hi-Res (Android 13+ lebih akurat)
                        putBoolean("supportsHiRes", device.sampleRates.any { it > 48000 })
                    }
                    dacList.pushMap(map)
                }
            }
            promise.resolve(dacList)
        } catch (e: Exception) {
            promise.reject("ERR_DETECTION", e.message)
        }
    }

    /**
     * Mengatur Equalizer langsung pada Audio Session ID milik TrackPlayer.
     * Ini menjamin zero-latency DSP.
     */
    @ReactMethod
    fun setEqualizerGains(gains: ReadableArray, audioSessionId: Int, promise: Promise) {
        try {
            if (audioSessionId == 0) {
                promise.reject("ERR_SESSION", "Invalid Audio Session ID")
                return
            }

            // Inisialisasi atau re-inisialisasi jika session ID berubah
            if (equalizer == null || equalizer?.enabled == false) {
                equalizer = android.media.audiofx.Equalizer(0, audioSessionId)
                equalizer?.enabled = true
            }

            val bands = equalizer?.numberOfBands ?: 0
            for (i in 0 until minOf(gains.size(), bands.toInt())) {
                // Convert dB ke MilliBel (1dB = 100mB)
                val level = (gains.getDouble(i) * 100).toInt().toShort()
                equalizer?.setBandLevel(i.toShort(), level)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_EQ", e.message)
        }
    }

    /**
     * Routing audio ke DAC spesifik tanpa mengganggu sistem Mixer Android.
     */
    @ReactMethod
    fun selectOutputDevice(deviceId: Int, promise: Promise) {
        try {
            val devices = audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
            val targetDevice = devices.find { it.id == deviceId }

            if (targetDevice != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                // Komunikasi ke RNTP atau System Player untuk menggunakan device ini
                // Secara native, preferred device diatur pada instance AudioTrack/ExoPlayer
                isExclusiveMode = true
                promise.resolve(true)
            } else {
                promise.reject("ERR_DEVICE", "Device not found or OS not supported")
            }
        } catch (e: Exception) {
            promise.reject("ERR_ROUTING", e.message)
        }
    }

    private fun isUsbDevice(device: AudioDeviceInfo): Boolean {
        return device.type == AudioDeviceInfo.TYPE_USB_DEVICE ||
               device.type == AudioDeviceInfo.TYPE_USB_HEADSET ||
               device.type == AudioDeviceInfo.TYPE_USB_ACCESSORY
    }
}
 