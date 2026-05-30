package com.pristineaudio.audio

class OboeAudioProcessor {

    fun start() {
        NativePristineAudio.nativeStart()
    }

    fun stop() {
        NativePristineAudio.nativeStop()
    }
}