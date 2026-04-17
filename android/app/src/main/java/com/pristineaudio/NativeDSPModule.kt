package com.pristineaudio

import com.facebook.react.bridge.*

class NativeDSPModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    override fun getName() = "NativeDSPModule"

    private external fun setNativeMasterGain(gain: Float)
    private external fun setNativeStereoWide(width: Float)
    private external fun setNativeEqualizerBand(band: Int, gain: Float)

    @ReactMethod
    fun setMasterGain(gain: Float) = setNativeMasterGain(gain)

    @ReactMethod
    fun setSoundstage(width: Float) = setNativeStereoWide(width)

    @ReactMethod
    fun setEqualizerBand(band: Int, gain: Float) = setNativeEqualizerBand(band, gain)
}
 