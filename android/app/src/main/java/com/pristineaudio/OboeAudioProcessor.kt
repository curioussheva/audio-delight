package com.pristineaudio

import androidx.media3.common.audio.BaseAudioProcessor
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.C
import java.nio.ByteBuffer

class OboeAudioProcessor : BaseAudioProcessor() {

    // 🔥 Kirim raw buffer langsung (zero-copy style JNI)
    private external fun feedNativeBuffer(buffer: ByteBuffer, size: Int, encoding: Int)

    companion object {
        init {
            System.loadLibrary("pristineaudio_engine")
        }
    }

    private var isBypassMode = false

    fun setBypassMode(enabled: Boolean) {
        isBypassMode = enabled
    }

    override fun onConfigure(inputAudioFormat: AudioProcessor.AudioFormat): AudioProcessor.AudioFormat {
        if (inputAudioFormat.encoding != C.ENCODING_PCM_16BIT &&
            inputAudioFormat.encoding != C.ENCODING_PCM_FLOAT) {
            throw AudioProcessor.UnhandledAudioFormatException(inputAudioFormat)
        }
        return inputAudioFormat
    }

    override fun queueInput(inputBuffer: ByteBuffer) {
    if (!inputBuffer.hasRemaining()) return

    val size = inputBuffer.remaining()
    val startPos = inputBuffer.position()

    if (inputBuffer.isDirect) {
        feedNativeBuffer(inputBuffer, size, inputAudioFormat.encoding)
    } else {
        val temp = ByteBuffer.allocateDirect(size)
        temp.put(inputBuffer)
        temp.flip()
        feedNativeBuffer(temp, size, inputAudioFormat.encoding)
    }

    // restore posisi
    inputBuffer.position(startPos)

    // SELALU teruskan buffer (jangan break pipeline)
    replaceOutputBuffer(size).put(inputBuffer).flip()
}
}
 