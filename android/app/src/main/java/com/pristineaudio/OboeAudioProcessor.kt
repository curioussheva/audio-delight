package com.pristineaudio

import com.google.android.exoplayer2.audio.AudioProcessor
import com.google.android.exoplayer2.audio.BaseAudioProcessor
import java.nio.ByteBuffer
import java.nio.ByteOrder

class OboeAudioProcessor : BaseAudioProcessor() {
    private external fun feedNativeAudio(data: FloatArray, numSamples: Int)

    override fun onConfigure(inputAudioFormat: AudioProcessor.AudioFormat): AudioProcessor.AudioFormat {
        return AudioProcessor.AudioFormat(inputAudioFormat.sampleRate, 2, com.google.android.exoplayer2.C.ENCODING_PCM_FLOAT)
    }

    override fun queueInput(inputBuffer: ByteBuffer) {
        val frameCount = inputBuffer.remaining() / 4
        val audioData = FloatArray(frameCount)
        inputBuffer.order(ByteOrder.nativeOrder()).asFloatBuffer().get(audioData)
        feedNativeAudio(audioData, frameCount)
        inputBuffer.position(inputBuffer.limit())
    }
}
