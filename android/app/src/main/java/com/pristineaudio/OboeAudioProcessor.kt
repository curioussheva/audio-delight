package com.pristineaudio

import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.audio.BaseAudioProcessor
import androidx.media3.common.C
import java.nio.ByteBuffer

class OboeAudioProcessor : BaseAudioProcessor() {

    // JNI Bridge ke C++
    private external fun feedNativeAudio(data: FloatArray, numSamples: Int)

    companion object {
        init {
            // Gunakan nama library yang sama dengan NativeDSPModule
            System.loadLibrary("pristineaudio_engine")
        }
    }

    override fun onConfigure(inputAudioFormat: AudioProcessor.AudioFormat): AudioProcessor.AudioFormat {
        // Engine kita (AudioEngine.h) minta Float atau 16-bit
        if (inputAudioFormat.encoding != C.ENCODING_PCM_16BIT && 
            inputAudioFormat.encoding != C.ENCODING_PCM_FLOAT) {
            throw AudioProcessor.UnhandledAudioFormatException(inputAudioFormat)
        }
        return inputAudioFormat
    }

    override fun queueInput(inputBuffer: ByteBuffer) {
        if (!inputBuffer.hasRemaining()) return

        // Konversi ke FloatArray karena AudioEngine::pushData butuh const float*
        val floatArray = if (inputAudioFormat.encoding == C.ENCODING_PCM_FLOAT) {
            val fb = inputBuffer.asFloatBuffer()
            FloatArray(fb.remaining()).also { fb.get(it) }
        } else {
            val sb = inputBuffer.asShortBuffer()
            FloatArray(sb.remaining()).also { 
                for (i in it.indices) it[i] = sb.get().toFloat() / 32768.0f 
            }
        }

        // Kirim data ke AudioEngine::pushData via JNI
        feedNativeAudio(floatArray, floatArray.size)

        // Teruskan buffer ke sink berikutnya (agar tidak memutus aliran data)
        replaceOutputBuffer(inputBuffer.remaining()).put(inputBuffer).flip()
    }
}
 