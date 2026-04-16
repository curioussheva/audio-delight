package com.pristineaudio

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class USBDACPackage : ReactPackage {

    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    return listOf(
        USBDACModule(reactContext),
        NativeDSPModule(reactContext),
        NativeVisualizerBridge(reactContext),
        MediaStoreModule(reactContext)
        OboeAudioProcessor(reactContext)
    )
}

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}  