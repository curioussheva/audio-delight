package com.pristineaudio.audio

import androidx.annotation.Keep
import androidx.media3.common.C
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.audio.BaseAudioProcessor
import androidx.media3.common.util.UnstableApi
import java.nio.ByteBuffer

/**
 * AudioProcessor Media3 yang menyadap PCM buffer ExoPlayer dan meneruskannya
 * ke native engine (Oboe) lewat JNI — dipasang di DefaultAudioSink lewat
 * APMRenderersFactory. Selalu pass-through (tidak mengubah audio yang
 * didengar lewat AudioTrack); mode BIT_PERFECT membisukan exoPlayer.volume
 * secara terpisah di AudioPlayer, bukan di sini.
 *
 * PENTING: file ini harus fisik berada di dalam module RNTP
 * (node_modules/react-native-track-player/.../player/audio/), BUKAN di
 * android/app/ — lihat scripts/custom-rntp/ + patch-pristine.sh.
 */
@UnstableApi
class OboeAudioProcessor : BaseAudioProcessor() {

    companion object {
        init {
            System.loadLibrary("pristine-audio")
        }
    }

    // JNI instance methods — signature harus persis sama dengan
    // jni/NativeAudioFeed.cpp (Java_..._OboeAudioProcessor_feedFloatBuffer /
    // feedPCM16Buffer, keduanya method instance, bukan static).
    @Keep private external fun feedFloatBuffer(buffer: ByteBuffer, size: Int)
    @Keep private external fun feedPCM16Buffer(buffer: ByteBuffer, size: Int)

    @Volatile
    private var bypassed = false

    /**
     * true  -> processor tetap pass-through tapi TIDAK feed native (hemat
     *          JNI call kalau immersive/DSP mode sedang tidak butuh sinyal ini)
     * false -> feed native tiap buffer, seperti biasa
     */
    fun setBypassMode(bypass: Boolean) {
        bypassed = bypass
    }

    override fun onConfigure(inputAudioFormat: AudioProcessor.AudioFormat): AudioProcessor.AudioFormat {
        if (inputAudioFormat.encoding != C.ENCODING_PCM_FLOAT &&
            inputAudioFormat.encoding != C.ENCODING_PCM_16BIT
        ) {
            throw AudioProcessor.UnhandledAudioFormatException(inputAudioFormat)
        }
        // Pass-through murni: format output sama dengan format input.
        return inputAudioFormat
    }

    override fun queueInput(inputBuffer: ByteBuffer) {
        val remaining = inputBuffer.remaining()
        if (remaining == 0) return

        if (!bypassed) {
            // NB: GetDirectBufferAddress di native side mengambil alamat awal
            // buffer, tidak menghormati position(). Asumsi: inputBuffer yang
            // sampai ke sini posisinya selalu 0 (umum untuk AudioProcessor
            // pertama/tunggal di chain). Kalau APMRenderersFactory menaruh
            // processor lain SEBELUM ini yang mengubah position, perlu
            // di-slice/duplicate dulu sebelum dikirim ke JNI — cek kalau ada
            // artefak/glitch di sisi native.
            when (inputAudioFormat.encoding) {
                C.ENCODING_PCM_FLOAT -> feedFloatBuffer(inputBuffer, remaining)
                C.ENCODING_PCM_16BIT -> feedPCM16Buffer(inputBuffer, remaining)
            }
        }

        // Selalu pass-through tanpa modifikasi — DSP sesungguhnya terjadi di
        // native engine lewat jalur terpisah (AudioEngine/AudioCallback),
        // bukan di processor ini.
        val outputBuffer = replaceOutputBuffer(remaining)
        outputBuffer.put(inputBuffer)
        outputBuffer.flip()
    }
}
