package com.pristineaudio

import android.content.Context
import android.media.*
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class USBDACModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private val audioManager = reactContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager

    // Callback untuk deteksi colok/cabut DAC secara real-time
    private val audioDeviceCallback = object : AudioDeviceCallback() {
        override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>) {
            if (addedDevices.any { isUsbDevice(it) }) {
                sendEvent("onDACChange", Arguments.createMap().apply {
                    putString("status", "connected")
                })
            }
        }

        override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>) {
            if (removedDevices.any { isUsbDevice(it) }) {
                sendEvent("onDACChange", Arguments.createMap().apply {
                    putString("status", "disconnected")
                })
            }
        }
    }

    init {
        audioManager.registerAudioDeviceCallback(audioDeviceCallback, null)
    }

    override fun getName(): String = "USBDACModule"

    override fun invalidate() {
        audioManager.unregisterAudioDeviceCallback(audioDeviceCallback)
        super.invalidate()
    }

    @ReactMethod
    fun detectDACs(promise: Promise) {
        try {
            val devices = audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
            val dacList = Arguments.createArray()

            devices.forEach { device ->
                if (isUsbDevice(device)) {
                    val map = Arguments.createMap().apply {
                        putInt("id", device.id)
                        putString("name", device.productName?.toString() ?: "Unknown USB DAC")
                        // Ambil daftar sample rate yang didukung hardware
                        val srArray = Arguments.createArray()
                        device.sampleRates.forEach { srArray.pushInt(it) }
                        putArray("sampleRates", srArray)
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

    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}
}
 