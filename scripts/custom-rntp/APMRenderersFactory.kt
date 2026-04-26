package com.lovegaoshi.kotlinaudio.player.components

import android.content.Context
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.audio.AudioSink
import androidx.media3.exoplayer.audio.DefaultAudioSink
import androidx.media3.exoplayer.audio.TeeAudioProcessor
import com.lovegaoshi.kotlinaudio.processors.FFTEmitter
import com.lovegaoshi.kotlinaudio.processors.TeeListener

@UnstableApi
class APMRenderersFactory(
    context: Context,
    sampleRate: Int = 4096,
    emitter: FFTEmitter?
) : DefaultRenderersFactory(context) {
    
    // Processor ini yang biasanya digunakan RNTP untuk visualizer/FFT
    val teeProcessor = TeeAudioProcessor(TeeListener(sampleRate, emitter))

    @OptIn(UnstableApi::class)
    override fun buildAudioSink(
        context: Context,
        enableFloatOutput: Boolean,
        enableAudioTrackPlaybackParams: Boolean
    ): AudioSink? {
        // Kita membangun Sink secara manual untuk menyuntikkan teeProcessor
        return DefaultAudioSink.Builder(context)
            .setEnableFloatOutput(enableFloatOutput)
            .setEnableAudioTrackPlaybackParams(enableAudioTrackPlaybackParams)
            .setAudioProcessors(arrayOf(teeProcessor))
            .build()
    }
}
 