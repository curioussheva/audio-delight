package com.pristineaudio

import android.content.Context
import android.media.*
import android.os.Build
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.modules.core.DeviceEventManagerModule

@ReactModule(name = USBDACModule.NAME)
class USBDACModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private val audioManager = reactContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private var equalizer: android.media.audiofx.Equalizer? = null
    private var currentAudioSessionId: Int = 0
    private var isExclusiveActive: Boolean = false

    // ─── CALLBACK UNTUK USB HOT-PLUG ──────────────────────────────────────────
    private val audioDeviceCallback = object : AudioDeviceCallback() {
        override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>) {
            addedDevices.firstOrNull { isUsbDevice(it) }?.let { device ->
                val event = Arguments.createMap().apply {
                    putString("status", "connected")
                    putMap("dac", createDacMap(device)) // Kirim object DAC lengkap ke TS
                }
                sendEvent("onDACChange", event)
                Log.d("USBDAC", "USB DAC Connected: ${device.productName}")
            }
        }

        override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>) {
            if (removedDevices.any { isUsbDevice(it) }) {
                val event = Arguments.createMap().apply {
                    putString("status", "disconnected")
                }
                sendEvent("onDACChange", event)
                Log.d("USBDAC", "USB DAC Disconnected")
            }
        }
    }

    init {
        audioManager.registerAudioDeviceCallback(audioDeviceCallback, null)
    }

    companion object { const val NAME = "USBDACModule" }
    override fun getName(): String = NAME

    override fun invalidate() {
        audioManager.unregisterAudioDeviceCallback(audioDeviceCallback)
        releaseEqualizerInternal()
        super.invalidate()
    }

    // ─── 1. DETEKSI DAC ───────────────────────────────────────────────────────
    
    @ReactMethod
    fun detectDACs(promise: Promise) {
        try {
            val devices = audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
            val dacList = Arguments.createArray()

            devices.forEach { device ->
                if (isUsbDevice(device)) {
                    dacList.pushMap(createDacMap(device))
                }
            }
            promise.resolve(dacList)
        } catch (e: Exception) {
            promise.reject("ERR_DETECTION", e.message)
        }
    }

    // Helper untuk mapping device ke format yang dimengerti TypeScript
    private fun createDacMap(device: AudioDeviceInfo): WritableMap {
        return Arguments.createMap().apply {
            putString("id", device.id.toString())
            putString("name", device.productName?.toString() ?: "Unknown USB DAC")
            putString("type", "usb")
            
            val rates = Arguments.createArray()
            device.sampleRates.forEach { rates.pushInt(it) }
            putArray("sampleRates", rates)

            val channels = Arguments.createArray()
            device.channelCounts.forEach { channels.pushInt(it) }
            putArray("channelCounts", channels)
            
            // Android tidak expose bitDepth secara langsung di AudioDeviceInfo API lama
            // Kita beri array kosong atau nilai default agar TS tidak crash
            val bitDepths = Arguments.createArray()
            bitDepths.pushInt(16)
            bitDepths.pushInt(24)
            putArray("bitDepths", bitDepths)

            putBoolean("supportsHiRes", device.sampleRates.any { it > 48000 })
            putInt("currentSampleRate", 48000)
            
            // Mock Capabilities agar interface TS DACCapabilities terpenuhi
            val capabilities = Arguments.createMap().apply {
                putBoolean("hiRes", device.sampleRates.any { it > 48000 })
                putBoolean("dsdDoP", false)
                putBoolean("mqaRenderer", false)
            }
            putMap("capabilities", capabilities)
        }
    }

    // ─── 2. EXCLUSIVE MODE & SETTINGS ─────────────────────────────────────────

    @ReactMethod
    fun isExclusiveModeActive(promise: Promise) {
        promise.resolve(isExclusiveActive)
    }

    @ReactMethod
    fun setExclusiveMode(dacId: String, enable: Boolean, promise: Promise) {
        try {
            // Implementasi Bypass OS Mixer di sini (misal via Oboe/AAudio)
            isExclusiveActive = enable
            
            val result = Arguments.createMap().apply {
                putBoolean("success", true)
                putBoolean("active", enable)
                putString("mode", if (enable) "exclusive" else "system")
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("ERR_EXCLUSIVE", e.message)
        }
    }

    @ReactMethod
    fun setSampleRate(rate: Int, promise: Promise) {
        try {
            // Implementasi pergantian clock rate hardware DAC
            val result = Arguments.createMap().apply {
                putBoolean("success", true)
                putInt("sampleRate", rate)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("ERR_SAMPLERATE", e.message)
        }
    }

    @ReactMethod
    fun getRecommendedSettings(dacId: String, promise: Promise) {
        try {
            val result = Arguments.createMap().apply {
                putInt("sampleRate", 192000) // Default target untuk Hi-Res
                putInt("bitDepth", 24)
                putInt("bufferSize", 512)
                putString("dsdMode", "off")
                putBoolean("exclusiveModeRecommended", true)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("ERR_SETTINGS", e.message)
        }
    }

    // ─── 3. AUDIO SESSION & EQUALIZER ─────────────────────────────────────────

    @ReactMethod
    fun createAudioSession(promise: Promise) {
        try {
            val sessionId = if (currentAudioSessionId > 0) currentAudioSessionId else audioManager.generateAudioSessionId()
            currentAudioSessionId = sessionId
            
            val result = Arguments.createMap().apply {
                putInt("sessionId", sessionId)
                putBoolean("isNew", true)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("ERR_SESSION", e.message)
        }
    }

    @ReactMethod
    fun getCurrentAudioSessionId(promise: Promise) {
        promise.resolve(currentAudioSessionId)
    }

    @ReactMethod
    fun releaseAudioSession(promise: Promise) {
        releaseEqualizerInternal()
        promise.resolve(true)
    }

    @ReactMethod
    fun setEqualizerGains(gains: ReadableArray, audioSessionId: Int, promise: Promise) {
        try {
            if (audioSessionId <= 0) {
                promise.reject("ERR_SESSION", "Invalid Audio Session ID")
                return
            }

            if (equalizer == null || currentAudioSessionId != audioSessionId) {
                releaseEqualizerInternal()
                equalizer = android.media.audiofx.Equalizer(0, audioSessionId).apply {
                    enabled = true
                }
                currentAudioSessionId = audioSessionId
            }

            val eq = equalizer!!
            val range = eq.bandLevelRange
            val minLevel = range[0]
            val maxLevel = range[1]

            val numBands = eq.numberOfBands.toInt()
            val gainsSize = gains.size()
            val bandsToApply = if (gainsSize < numBands) gainsSize else numBands

            for (i in 0 until bandsToApply) {
                var level = (gains.getDouble(i) * 100).toInt().toShort()
                if (level < minLevel) level = minLevel
                if (level > maxLevel) level = maxLevel
                eq.setBandLevel(i.toShort(), level)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_EQ", "Hardware rejected EQ: ${e.message}")
        }
    }

    @ReactMethod
    fun releaseEqualizer(promise: Promise) {
        releaseEqualizerInternal()
        promise.resolve(true)
    }

    private fun releaseEqualizerInternal() {
        try {
            equalizer?.release()
        } catch (e: Exception) {
            Log.e("USBDAC", "Error releasing equalizer", e)
        } finally {
            equalizer = null
            currentAudioSessionId = 0
        }
    }

    // ─── UTILS ────────────────────────────────────────────────────────────────

    private fun isUsbDevice(device: AudioDeviceInfo): Boolean {
        return device.type == AudioDeviceInfo.TYPE_USB_DEVICE ||
               device.type == AudioDeviceInfo.TYPE_USB_HEADSET ||
               device.type == AudioDeviceInfo.TYPE_USB_ACCESSORY
    }

    private fun sendEvent(eventName: String, params: Any?) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    // Dummy method yang diwajibkan oleh React Native NativeEventEmitter
    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}
}
 