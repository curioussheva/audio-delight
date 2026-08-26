package com.pristineaudio.audio

import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = NativeDeviceModule.NAME)
class NativeDeviceModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    companion object {
        const val NAME = "NativeDeviceModule"
    }

    init {
        System.loadLibrary("pristine-audio")
    }

    private external fun nativeGetDevices(): Array<Any>
    private external fun nativeSetActiveDevice(deviceId: String): Boolean

    override fun getName() = NAME

    @ReactMethod
    fun getDevices(promise: Promise) {
        // Stub: JNI saat ini mengembalikan array kosong
        promise.resolve(Arguments.createArray())
    }

    @ReactMethod
    fun setActiveDevice(deviceId: String, promise: Promise) {
        try {
            val ok = nativeSetActiveDevice(deviceId)
            promise.resolve(ok)
        } catch (e: Exception) {
            promise.reject("DEVICE_ERROR", e.message)
        }
    }
}