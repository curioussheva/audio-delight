package com.pristineaudio.audio

object NativePristineAudio {

    init {
        System.loadLibrary("pristine-audio")
    }

    external fun nativeStart()
    external fun nativeStop()
}