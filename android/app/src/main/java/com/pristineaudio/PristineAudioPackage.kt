package com.pristineaudio

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

import com.pristineaudio.USBDACModule
import com.pristineaudio.dsp.NativeDSPModule
import com.pristineaudio.NativeVisualizerBridge
import com.pristineaudio.MediaStoreModule
import com.pristineaudio.audio.NativePristineAudio
import com.pristineaudio.audio.NativePlaybackModule
import com.pristineaudio.audio.NativeDeviceModule
import com.pristineaudio.playback.NativePlaybackService

class PristineAudioPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(
            USBDACModule(reactContext),
            NativeDSPModule(reactContext),
            NativeVisualizerBridge(reactContext),
            MediaStoreModule(reactContext),
            NativePristineAudio(reactContext),
            NativePlaybackModule(reactContext),
            NativeDeviceModule(reactContext),
            NativePlaybackService(reactContext)
        )
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}