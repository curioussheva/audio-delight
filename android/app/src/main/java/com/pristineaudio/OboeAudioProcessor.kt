package com.pristineaudio

import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.audio.AudioProcessor.AudioFormat
import androidx.media3.common.C
import java.nio.ByteBuffer
import java.nio.ByteOrder

class OboeAudioProcessor : AudioProcessor {
    private var inputAudioFormat: AudioFormat = AudioFormat.NOT_SET

    // JNI Call ke C++ (native-lib.cpp)
    private external fun feedNativeAudio(data: ByteBuffer, size: Int)

    override fun configure(inputAudioFormat: AudioFormat): AudioFormat {
        this.inputAudioFormat = inputAudioFormat
        // Kita paksa output processor ini ke Float PCM agar C++ bisa mengolahnya dengan presisi tinggi
        return AudioFormat(inputAudioFormat.sampleRate, inputAudioFormat.channelCount, C.ENCODING_PCM_FLOAT)
    }

    override fun isActive(): Boolean = true

    override fun queueInput(inputBuffer: ByteBuffer) {
        if (!inputBuffer.hasRemaining()) return

        val size = inputBuffer.remaining()
        // Kirim alamat memori buffer langsung ke C++
        feedNativeAudio(inputBuffer, size)

        // Buat inputBuffer dianggap sudah selesai diproses (dimakan oleh Oboe)
        inputBuffer.position(inputBuffer.limit())
    }

    override fun queueEndOfStream() {}
    override fun getOutput(): ByteBuffer = AudioProcessor.EMPTY_BUFFER
    override fun isEnded(): Boolean = false
    override fun flush() {}
    override fun reset() {
        inputAudioFormat = AudioFormat.NOT_SET
    }
} 