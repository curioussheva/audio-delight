@file:OptIn(UnstableApi::class)

package com.lovegaoshi.kotlinaudio.player

import android.content.Context
import android.media.AudioManager
import androidx.annotation.Keep
import androidx.media3.common.*
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.*
import androidx.media3.exoplayer.audio.*
import com.lovegaoshi.kotlinaudio.models.*
import com.lovegaoshi.kotlinaudio.player.components.*
import com.pristineaudio.audio.OboeAudioProcessor
import kotlinx.coroutines.*
import timber.log.Timber


abstract class AudioPlayer(
    private val context: Context,
    val options: PlayerOptions = PlayerOptions()
) {

    // =============================
    // JNI
    // =============================
    companion object {
        init {
            System.loadLibrary("pristine-audio")
        }
    }

    @Keep private external fun nativeInitEngine(sr: Int, burst: Int)
    @Keep private external fun nativeStartEngine()
    @Keep private external fun nativeStopEngine()
    @Keep private external fun nativeSetVolume(volume: Float)
    @Keep private external fun nativeSetProcessingMode(mode: Int)

    // =============================
    // MODE
    // =============================
    enum class AudioMode {
        DSP,
        BIT_PERFECT,
        DEBUG
    }

    private var oboeProcessor: OboeAudioProcessor? = null

    var audioMode: AudioMode = AudioMode.DSP
        set(value) {
            field = value

            when (value) {
                AudioMode.DSP -> {
                    nativeSetProcessingMode(1)
                    oboeProcessor?.setBypassMode(false)
                    exoPlayer.volume = 1f
                }

                AudioMode.BIT_PERFECT -> {
                    nativeSetProcessingMode(0)
                    oboeProcessor?.setBypassMode(true)

                    // 🔥 MUTE EXO OUTPUT
                    exoPlayer.volume = 0f
                }

                AudioMode.DEBUG -> {
                    nativeSetProcessingMode(1)
                    oboeProcessor?.setBypassMode(false)
                    exoPlayer.volume = 1f
                }
            }
        }

    // =============================
    // PLAYER
    // =============================
    private val scope = MainScope()

    private var exoPlayer: ExoPlayer
    private var playerListener = PlayerListener()

    // =============================
    // INIT
    // =============================
    init {
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager

        val sr = audioManager.getProperty(AudioManager.PROPERTY_OUTPUT_SAMPLE_RATE)?.toInt() ?: 48000
        val burst = audioManager.getProperty(AudioManager.PROPERTY_OUTPUT_FRAMES_PER_BUFFER)?.toInt() ?: 256

        nativeInitEngine(sr, burst)
        nativeStartEngine()

        exoPlayer = buildPlayer()
        exoPlayer.addListener(playerListener)
    }

    // =============================
    // EXOPLAYER + OBOE INJECTION
    // =============================
    private fun buildPlayer(): ExoPlayer {

        val processor = OboeAudioProcessor()
        oboeProcessor = processor

        val renderer = object : DefaultRenderersFactory(context) {
            override fun buildAudioSink(
                context: Context,
                enableFloatOutput: Boolean,
                enableAudioTrackPlaybackParams: Boolean
            ): AudioSink {

                return DefaultAudioSink.Builder(context)
                    .setEnableFloatOutput(true)
                    .setAudioProcessors(arrayOf(processor))
                    .build()
            }
        }

        return ExoPlayer.Builder(context)
            .setRenderersFactory(renderer)
            .build()
    }

    // =============================
    // CONTROL
    // =============================
    fun load(item: AudioItem) {
        exoPlayer.setMediaItem(audioItem2MediaItem(item))
        exoPlayer.prepare()
    }

    fun play() {
        nativeStartEngine()
        exoPlayer.play()
    }

    fun pause() {
        exoPlayer.pause()
    }

    fun stop() {
        exoPlayer.stop()
        nativeStopEngine()
    }

    fun setVolume(volume: Float) {
        exoPlayer.volume = volume
        nativeSetVolume(volume)
    }

    // =============================
    // FADE
    // =============================
    fun fadeVolume(target: Float, duration: Long = 300) {
        scope.launch {
            val start = exoPlayer.volume
            val steps = 20
            val stepTime = duration / steps

            for (i in 1..steps) {
                val v = start + (target - start) * (i / steps.toFloat())
                exoPlayer.volume = v
                nativeSetVolume(v)
                delay(stepTime)
            }
        }
    }

    // =============================
    // RELEASE
    // =============================
    fun release() {
        exoPlayer.release()
        nativeStopEngine()
    }

    // =============================
    // LISTENER
    // =============================
    inner class PlayerListener : Player.Listener {

        override fun onPlaybackStateChanged(state: Int) {
            when (state) {
                Player.STATE_READY -> Timber.d("READY")
                Player.STATE_BUFFERING -> Timber.d("BUFFERING")
                Player.STATE_ENDED -> Timber.d("ENDED")
            }
        }

        override fun onPlayerError(error: PlaybackException) {
            Timber.e("Error: ${error.message}")
        }
    }
}