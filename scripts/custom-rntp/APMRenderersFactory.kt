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

    val teeProcessor = TeeAudioProcessor(TeeListener(sampleRate, emitter))
    val oboeProcessor = OboeAudioProcessor()

    @OptIn(UnstableApi::class)
    override fun buildAudioSink(
        context: Context,
        enableFloatOutput: Boolean,
        enableAudioTrackPlaybackParams: Boolean
    ): AudioSink {

        return DefaultAudioSink.Builder(context)
            .setEnableFloatOutput(true) // paksa float
            .setEnableAudioTrackPlaybackParams(enableAudioTrackPlaybackParams)
            .setAudioProcessors(
                arrayOf(
                    teeProcessor,   // visualizer
                    oboeProcessor   // 🔥 native pipeline
                )
            )
            .build()
    }
}
