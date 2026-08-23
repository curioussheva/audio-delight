package com.pristineaudio.audio

import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = OboeAudioProcessorModule.NAME)
class OboeAudioProcessorModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    companion object {
        const val NAME = "OboeAudioProcessor"
    }

    init {
        System.loadLibrary("pristine-audio")
    }

    // JNI uses DirectBuffer, not exposed as ReactMethod for now.
    override fun getName() = NAME
}