@file: OptIn(UnstableApi::class) package com.lovegaoshi.kotlinaudio.player

import android.content.Context
import android.media.AudioManager
import android.media.audiofx.Equalizer
import android.media.audiofx.LoudnessEnhancer
import androidx.annotation.CallSuper
import androidx.annotation.Keep
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Metadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.Player.Listener
import androidx.media3.common.TrackSelectionParameters
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.cache.SimpleCache
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.analytics.AnalyticsListener
import com.lovegaoshi.kotlinaudio.event.PlayerEventHolder
import com.lovegaoshi.kotlinaudio.models.AudioItem
import com.lovegaoshi.kotlinaudio.models.audioItem2MediaItem
import com.lovegaoshi.kotlinaudio.models.AudioItemTransitionReason
import com.lovegaoshi.kotlinaudio.models.AudioPlayerState
import com.lovegaoshi.kotlinaudio.models.mediaItem2AudioItem
import com.lovegaoshi.kotlinaudio.models.MediaSessionCallback
import com.lovegaoshi.kotlinaudio.models.PlayWhenReadyChangeData
import com.lovegaoshi.kotlinaudio.models.PlaybackError
import com.lovegaoshi.kotlinaudio.models.PlayerOptions
import com.lovegaoshi.kotlinaudio.models.PositionChangedReason
import com.lovegaoshi.kotlinaudio.models.setWakeMode
import com.lovegaoshi.kotlinaudio.player.components.APMRenderersFactory
import com.lovegaoshi.kotlinaudio.player.components.Cache
import com.lovegaoshi.kotlinaudio.player.components.FocusManager
import com.lovegaoshi.kotlinaudio.player.components.MediaFactory
import com.lovegaoshi.kotlinaudio.player.components.setupBuffer
import com.lovegaoshi.kotlinaudio.processors.FFTEmitter
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import timber.log.Timber
import java.util.Locale
import java.util.concurrent.TimeUnit
import kotlin.math.min

abstract class AudioPlayer internal constructor(
    private val context: Context,
    val options: PlayerOptions = PlayerOptions()
) {

    // --- INTEGRASI OBOE (JNI BRIDGE) ---
    companion object {
        init {
            // Ganti "native-lib" dengan nama library C++ kamu jika berbeda di CMakeLists.txt
            System.loadLibrary("native-lib") 
        }
    }

    @Keep private external fun nativeInitEngine(sampleRate: Int, framesPerBurst: Int)
    @Keep private external fun nativeLoadSource(uri: String)
    @Keep private external fun nativePlay()
    @Keep private external fun nativePause()
    @Keep private external fun nativeStop()
    @Keep private external fun nativeSetVolume(volume: Float)
    @Keep private external fun nativeDestroyEngine()
    // -----------------------------------

    // for crossfading
    private var exoPlayer1: ExoPlayer
    private var exoPlayer2: ExoPlayer? = null
    private var loudnessEnhancers = ArrayList<LoudnessEnhancer>()
    private var equalizers = ArrayList<Equalizer>()
    private var currentExoPlayer = true

    var exoPlayer: ExoPlayer
    var player: ForwardingPlayer
    private var playerListener = PlayerListener()
    private val scope = MainScope()
    private var cache: SimpleCache? = null
    val playerEventHolder = PlayerEventHolder()
    private val focusListener = APMFocusListener()
    private val focusManager = FocusManager(context, listener=focusListener, options=options)
    var fftEmitter: (DoubleArray) -> Unit = { v -> Timber.tag("APMFFT").d("FFT emitted $v") }

    var alwaysPauseOnInterruption: Boolean
        get() = focusManager.alwaysPauseOnInterruption
        set(v) { focusManager.alwaysPauseOnInterruption = v }

    open val currentItem: AudioItem?
        get() = mediaItem2AudioItem(exoPlayer.currentMediaItem)

    var playbackError: PlaybackError? = null
    var playerState: AudioPlayerState = AudioPlayerState.IDLE
        private set(value) {
            if (value != field) {
                field = value
                playerEventHolder.updateAudioPlayerState(value)
                if (!options.handleAudioFocus) {
                    when (value) {
                        AudioPlayerState.IDLE,
                        AudioPlayerState.ERROR -> focusManager.abandonAudioFocusIfHeld()
                        AudioPlayerState.READY -> focusManager.requestAudioFocus()
                        else -> {}
                    }
                }
            }
        }

    var playWhenReady: Boolean
        get() = exoPlayer.playWhenReady
        set(value) {
            exoPlayer.playWhenReady = value
            if (value) nativePlay() else nativePause() // Sinkronisasi Oboe
        }

    val duration: Long
        get() {
            return if (exoPlayer.duration == C.TIME_UNSET) 0
            else exoPlayer.duration
        }

    val isCurrentMediaItemLive: Boolean
        get() = exoPlayer.isCurrentMediaItemLive

    private var oldPosition = 0L

    val position: Long
        get() {
            return if (exoPlayer.currentPosition == C.INDEX_UNSET.toLong()) 0
            else exoPlayer.currentPosition
        }

    val bufferedPosition: Long
        get() {
            return if (exoPlayer.bufferedPosition == C.INDEX_UNSET.toLong()) 0
            else exoPlayer.bufferedPosition
        }

    private var volumeMultiplier = 1f
        set(value) {
            field = value
            volume = volume
        }

    var volume: Float
        get() = exoPlayer.volume
        set(value) {
            val finalVolume = value * volumeMultiplier
            exoPlayer.volume = finalVolume
            nativeSetVolume(finalVolume) // BYPASS: Sinkronisasi volume ke Oboe
        }

    /**
     * fade volume of the current exoPlayer by a simple linear function.
     */
    fun fadeVolume(volume: Float = 1f, duration: Long = 500, interval: Long = 20L, callback: () -> Unit = { }): Deferred<Unit> {
        return scope.async {
            val volumeDiff = (volume - exoPlayer.volume) * interval / duration
            var fadeInDuration = duration
            while (fadeInDuration > 0) {
                fadeInDuration -= interval
                val newVolume = exoPlayer.volume + volumeDiff
                exoPlayer.volume = newVolume
                nativeSetVolume(newVolume) // Sync fade ke Oboe
                delay(interval)
            }
            exoPlayer.volume = volume
            nativeSetVolume(volume)
            callback()
            return@async
        }
    }

    var playbackSpeed: Float
        get() = exoPlayer.playbackParameters.speed
        set(value) {
            exoPlayer.setPlaybackSpeed(value)
        }

    var playbackPitch: Float
        get() = exoPlayer.playbackParameters.pitch
        set(v) {
            exoPlayer.playbackParameters = PlaybackParameters(playbackSpeed, v)
        }

    val isPlaying
        get() = exoPlayer.isPlaying

    private var wasDucking = false

    fun players (): List<ExoPlayer> {
        if (options.crossfade) {
            return listOf(exoPlayer1, exoPlayer2!!)
        }
        return listOf(exoPlayer)
    }

    fun setAudioOffload(offload: Boolean = true) {
        val audioOffloadPreferences =
            TrackSelectionParameters.AudioOffloadPreferences.Builder()
                .setAudioOffloadMode(
                    if (offload) TrackSelectionParameters.AudioOffloadPreferences.AUDIO_OFFLOAD_MODE_ENABLED
                    else TrackSelectionParameters.AudioOffloadPreferences.AUDIO_OFFLOAD_MODE_DISABLED)
                .setIsGaplessSupportRequired(true)
                .setIsSpeedChangeSupportRequired(true)
                .build()
        exoPlayer.trackSelectionParameters =
            exoPlayer.trackSelectionParameters
                .buildUpon()
                .setAudioOffloadPreferences(audioOffloadPreferences)
                .build()
    }

    private fun initExoPlayer(name: String): ExoPlayer {
        val nameHolder = arrayOf("")
        val renderer = if (options.useFFTProcessor > 0) APMRenderersFactory(
            context, options.useFFTProcessor, object: FFTEmitter {
                override fun onSpectrumReady(spectrum: FloatArray, maxRawAmp: Float) {
                    return
                }
                override fun onFrequencyFFTReady(fft: DoubleArray, max: Float) {
                    if (this@AudioPlayer.exoPlayer.toString() == nameHolder[0]) {
                        fftEmitter(fft)
                    }
                }

        }) else DefaultRenderersFactory(context)
        renderer.setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_PREFER)
        val mPlayer = ExoPlayer
            .Builder(context)
            .setRenderersFactory(renderer)
            .setHandleAudioBecomingNoisy(options.handleAudioBecomingNoisy)
            .setMediaSourceFactory(MediaFactory(context, cache))
            .setWakeMode(setWakeMode(options.wakeMode))
            .apply {
                setLoadControl(setupBuffer(options.bufferOptions))
            }
            .setSkipSilenceEnabled(options.skipSilence)
            .setName(name)
            .build()
        val audioAttributes = AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(options.audioContentType)
            .build()
        mPlayer.setAudioAttributes(audioAttributes, options.handleAudioFocus)
        nameHolder[0] = mPlayer.toString()
        mPlayer.addAnalyticsListener(AudioFxInitListener())
        return mPlayer
    }

    init {
        // --- INISIALISASI ENGINE NATIVE OBOE ---
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val sampleRate = audioManager.getProperty(AudioManager.PROPERTY_OUTPUT_SAMPLE_RATE)?.toInt() ?: 48000
        val framesPerBurst = audioManager.getProperty(AudioManager.PROPERTY_OUTPUT_FRAMES_PER_BUFFER)?.toInt() ?: 256
        
        nativeInitEngine(sampleRate, framesPerBurst)
        // ---------------------------------------

        if (options.cacheSize > 0) {
            cache = Cache.initCache(context, options.cacheSize)
        }
        playerEventHolder.updateAudioPlayerState(AudioPlayerState.IDLE)
        exoPlayer1 = initExoPlayer("APM-Player1")
        if (options.crossfade) { exoPlayer2 = initExoPlayer("APM-Player2") }
        exoPlayer = exoPlayer1
        player = if (options.nativeExample) ExampleForwardingPlayer(exoPlayer1, exoPlayer2) else APMForwardingPlayer(exoPlayer1, exoPlayer2)
        player.addListener(playerListener)
    }

    open fun load(item: AudioItem, playWhenReady: Boolean = true) {
        exoPlayer.playWhenReady = playWhenReady
        load(item)
    }

    open fun load(item: AudioItem) {
        // BYPASS: Kirim URL/Path ke C++ Engine
        // Pastikan AudioItem memiliki properti `audioUrl` (atau sesuaikan dengan model KotlinAudio kamu)
        item.audioUrl?.let { url ->
            nativeLoadSource(url)
        }

        players().forEach { p -> p.addMediaItem(audioItem2MediaItem(item)) }
        exoPlayer.prepare()
    }

    fun setLoudnessEnhance(gain: Int) {
        loudnessEnhancers.forEach { l ->
            l.setTargetGain(gain)
            l.enabled = true
        }
    }

    fun setEqualizerPreset(preset: Int) {
        equalizers.forEach { equalizer ->
            equalizer.usePreset(preset.toShort())
            equalizer.enabled = true
        }
    }

    fun getCurrentEQPreset(): Int {
        if (equalizers.isEmpty()) return -1
        return equalizers[0].currentPreset.toInt()
    }

    fun getEqualizerPresets(): List<String> {
        if (equalizers.isEmpty()) return arrayListOf()
        return Array(equalizers[0].numberOfPresets.toInt()) { i -> i }
            .map { i -> equalizers[0].getPresetName(i.toShort()) }
    }

    fun togglePlaying() {
        if (exoPlayer.isPlaying) pause() else play()
    }

    var skipSilence: Boolean
        get() = exoPlayer.skipSilenceEnabled
        set(value) {
            players().forEach { p -> p.skipSilenceEnabled = value }
        }

    fun play() {
        nativePlay() // OBOE PLAY
        exoPlayer.play()
        if (currentItem != null) {
            exoPlayer.prepare()
        }
    }

    fun prepare() {
        if (currentItem != null) {
            exoPlayer.prepare()
        }
    }

    fun pause() {
        nativePause() // OBOE PAUSE
        exoPlayer.pause()
    }

    @CallSuper
    open fun stop() {
        nativeStop() // OBOE STOP
        playerState = AudioPlayerState.STOPPED
        exoPlayer.playWhenReady = false
        exoPlayer.stop()
    }

    @CallSuper
    open fun clear() {
        players().forEach { p -> p.clearMediaItems() }
    }

    fun setPauseAtEndOfItem(pause: Boolean) {
        exoPlayer.pauseAtEndOfMediaItems = pause
    }

    @CallSuper
    open fun destroy() {
        nativeDestroyEngine() // BERSIHKAN MEMORI C++

        focusManager.abandonAudioFocusIfHeld()
        stop()

        players().forEach { p ->
            p.removeListener(playerListener)
            p.release()
        }
        equalizers.forEach { e -> e.release() }
        loudnessEnhancers.forEach { e -> e.release() }
        cache?.release()
        cache = null
    }

    open fun seek(duration: Long, unit: TimeUnit) {
        val positionMs = TimeUnit.MILLISECONDS.convert(duration, unit)
        exoPlayer.seekTo(positionMs)
        // Catatan: Kamu bisa tambahkan fungsi nativeSeek(positionMs) di sini jika engine C++ kamu mendukungnya
    }

    open fun seekBy(offset: Long, unit: TimeUnit) {
        val positionMs = exoPlayer.currentPosition + TimeUnit.MILLISECONDS.convert(offset, unit)
        exoPlayer.seekTo(positionMs)
    }

    fun crossFadePrepare(previous: Boolean = false, seekTo: Double = 0.0) {
        if (!options.crossfade) { return }
        val mPlayer = if (currentExoPlayer) exoPlayer2!! else exoPlayer1
        mPlayer.seekTo(exoPlayer.currentMediaItemIndex, C.TIME_UNSET)
        if (previous) { mPlayer.seekToPreviousMediaItem() }
        else { mPlayer.seekToNextMediaItem() }
        mPlayer.prepare()
        if (seekTo > 0) {
            mPlayer.seekTo((seekTo * 1000).toLong())
        }
    }

    fun switchExoPlayer(
        playerOperation: () -> Unit = ::play,
        fadeDuration: Long = 2500,
        fadeInterval: Long = 20,
        fadeToVolume: Float = 1f,
        waitUntil: Long = 0,
    ){
        if (!options.crossfade) {
            playerOperation()
            return
        }
        scope.launch {
            val delayAmount = if (waitUntil == 0L) 0 else {
                0L.coerceAtLeast(waitUntil - player.currentPosition)
            }
            delay(delayAmount)

            val prevPlayer: Player
            if (currentExoPlayer) {
                currentExoPlayer = false
                exoPlayer = exoPlayer2!!
                prevPlayer = exoPlayer1
            } else {
                currentExoPlayer = true
                exoPlayer = exoPlayer1
                prevPlayer = exoPlayer2!!
            }
            prevPlayer.setAudioAttributes(prevPlayer.audioAttributes, false)
            player.switchCrossFadePlayer()
            scope.launch {
                var fadeOutDuration = fadeDuration
                val startFadeOutTime = System.currentTimeMillis()
                val fadeFromVolume = prevPlayer.volume
                while (fadeOutDuration > 0) {
                    fadeOutDuration -= fadeInterval
                    val vol = fadeFromVolume * (1 - min((System.currentTimeMillis() - startFadeOutTime), fadeDuration).toFloat() / fadeDuration)
                    prevPlayer.volume = vol
                    nativeSetVolume(vol) // Sync crossfade Oboe
                    delay(fadeInterval)
                }
                prevPlayer.volume = 0f
                prevPlayer.pause()
            }
            scope.launch {
                exoPlayer.volume = 0f
                playerOperation()
                exoPlayer.setAudioAttributes(exoPlayer.audioAttributes, options.handleAudioFocus)
                if (fadeToVolume > 0) {
                    var fadeInDuration = fadeDuration
                    val startTime = System.currentTimeMillis()
                    while (fadeInDuration > 0) {
                        fadeInDuration -= fadeInterval
                        val vol = fadeToVolume * min((System.currentTimeMillis() - startTime), fadeDuration) / fadeDuration
                        exoPlayer.volume = vol
                        nativeSetVolume(vol) // Sync crossfade Oboe
                        delay(fadeInterval)
                    }
                }
            }
        }
    }

    inner class AudioFxInitListener: AnalyticsListener {
        @OptIn(UnstableApi::class)
        override fun onAudioSessionIdChanged(eventTime: AnalyticsListener.EventTime, audioSessionId: Int) {
            try {
                val enhancer = LoudnessEnhancer(audioSessionId)
                loudnessEnhancers.add(enhancer)
            } catch (e: RuntimeException) {
                Timber.tag("APMAudioFx").e("[AudioFx] failed to load loudnessEnhancer. it's fine if in dev!")
            }

            try {
                val equalizer = Equalizer(0, audioSessionId)
                equalizers.add(equalizer)
            } catch (e: RuntimeException) {
                Timber.tag("APMAudioFx").e("[AudioFx] failed to load equalizer. it's fine if in dev!")
            }
        }
    }

    inner class PlayerListener : Listener {
        override fun onMetadata(metadata: Metadata) {
            playerEventHolder.updateOnTimedMetadata(metadata)
        }

        override fun onMediaMetadataChanged(mediaMetadata: MediaMetadata) {
            playerEventHolder.updateOnCommonMetadata(mediaMetadata)
        }

        override fun onPositionDiscontinuity(oldPosition: Player.PositionInfo, newPosition: Player.PositionInfo, reason: Int) {
            this@AudioPlayer.oldPosition = oldPosition.positionMs
            // ... (Kode event discontinuity aslimu tetap sama) ...
        }

        override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
            // ... (Kode event transition aslimu tetap sama) ...
        }

        override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
            val pausedBecauseReachedEnd = reason == Player.PLAY_WHEN_READY_CHANGE_REASON_END_OF_MEDIA_ITEM
            playerEventHolder.updatePlayWhenReadyChange(PlayWhenReadyChangeData(playWhenReady, pausedBecauseReachedEnd))
        }

        override fun onEvents(player: Player, events: Player.Events) {
            for (i in 0 until events.size()) {
                when (events[i]) {
                    Player.EVENT_PLAYBACK_STATE_CHANGED -> {
                        val state = when (player.playbackState) {
                            Player.STATE_BUFFERING -> AudioPlayerState.BUFFERING
                            Player.STATE_READY -> AudioPlayerState.READY
                            Player.STATE_IDLE -> if (playerState == AudioPlayerState.ERROR || playerState == AudioPlayerState.STOPPED) null else AudioPlayerState.IDLE
                            Player.STATE_ENDED -> if (player.mediaItemCount > 0) AudioPlayerState.ENDED else AudioPlayerState.IDLE
                            else -> null
                        }
                        if (state != null && state != playerState) {
                            playerState = state
                        }
                    }
                    Player.EVENT_MEDIA_ITEM_TRANSITION -> {
                        playbackError = null
                        if (currentItem != null) {
                            playerState = AudioPlayerState.LOADING
                            if (isPlaying) {
                                playerState = AudioPlayerState.READY
                                playerState = AudioPlayerState.PLAYING
                            }
                        }
                    }
                    Player.EVENT_PLAY_WHEN_READY_CHANGED -> {
                        if (!player.playWhenReady && playerState != AudioPlayerState.STOPPED) {
                            playerState = AudioPlayerState.PAUSED
                        }
                    }
                    Player.EVENT_IS_PLAYING_CHANGED -> {
                        if (player.isPlaying) {
                            playerState = AudioPlayerState.PLAYING
                        }
                    }
                }
            }
        }

        override fun onPlayerError(error: PlaybackException) {
            val _playbackError = PlaybackError(
                error.errorCodeName.replace("ERROR_CODE_", "").lowercase(Locale.getDefault()).replace("_", "-"),
                error.message
            )
            playerEventHolder.updatePlaybackError(_playbackError)
            playbackError = _playbackError
            playerState = AudioPlayerState.ERROR
        }
    }

    private open inner class ExampleForwardingPlayer(val mPlayer1: ExoPlayer, val mPlayer2: ExoPlayer?): ForwardingPlayer(mPlayer1, mPlayer2) {
        override fun setMediaItems(mediaItems: MutableList<MediaItem>, resetPosition: Boolean) {
            mPlayer1.setMediaItems(mediaItems, resetPosition)
            mPlayer2?.setMediaItems(mediaItems, resetPosition)
        }
        override fun isCommandAvailable(command: Int): Boolean {
            if (options.alwaysShowNext) {
                return when (command) {
                    COMMAND_SEEK_TO_NEXT_MEDIA_ITEM, COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM -> true
                    else -> super.isCommandAvailable(command)
                }
            }
            return super.isCommandAvailable(command)
        }

        override fun getAvailableCommands(): Player.Commands {
            if (options.alwaysShowNext) {
                return super.getAvailableCommands().buildUpon()
                    .add(COMMAND_SEEK_TO_NEXT_MEDIA_ITEM)
                    .add(COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM)
                    .build()
            }
            return super.getAvailableCommands()
        }
    }

    private inner class APMForwardingPlayer(mPlayer1: ExoPlayer, mPlayer2: ExoPlayer?): ExampleForwardingPlayer(mPlayer1, mPlayer2) {
        override fun setMediaItems(mediaItems: MutableList<MediaItem>, resetPosition: Boolean) { return }
        override fun addMediaItems(mediaItems: MutableList<MediaItem>) { return }
        override fun addMediaItems(index: Int, mediaItems: MutableList<MediaItem>) { return }
        override fun setMediaItems(mediaItems: MutableList<MediaItem>, startIndex: Int, startPositionMs: Long) { return }
        override fun setMediaItems(mediaItems: MutableList<MediaItem>) { return }

        override fun play() { playerEventHolder.updateOnPlayerActionTriggeredExternally(MediaSessionCallback.PLAY) }
        override fun pause() { playerEventHolder.updateOnPlayerActionTriggeredExternally(MediaSessionCallback.PAUSE) }
        override fun seekToNext() { playerEventHolder.updateOnPlayerActionTriggeredExternally(MediaSessionCallback.NEXT) }
        override fun seekToNextMediaItem() { playerEventHolder.updateOnPlayerActionTriggeredExternally(MediaSessionCallback.NEXT) }
        override fun seekToPrevious() { playerEventHolder.updateOnPlayerActionTriggeredExternally(MediaSessionCallback.PREVIOUS) }
        override fun seekToPreviousMediaItem() { playerEventHolder.updateOnPlayerActionTriggeredExternally(MediaSessionCallback.PREVIOUS) }
        override fun seekForward() { playerEventHolder.updateOnPlayerActionTriggeredExternally(MediaSessionCallback.FORWARD) }
        override fun seekBack() { playerEventHolder.updateOnPlayerActionTriggeredExternally(MediaSessionCallback.REWIND) }
        override fun stop() { playerEventHolder.updateOnPlayerActionTriggeredExternally(MediaSessionCallback.STOP) }
        override fun seekTo(mediaItemIndex: Int, positionMs: Long) { playerEventHolder.updateOnPlayerActionTriggeredExternally(MediaSessionCallback.SEEK(positionMs)) }
        override fun seekTo(positionMs: Long) { playerEventHolder.updateOnPlayerActionTriggeredExternally(MediaSessionCallback.SEEK(positionMs)) }
    }

    private inner class APMFocusListener: AudioManager.OnAudioFocusChangeListener {
        override fun onAudioFocusChange(focusChange: Int) {
            // Ketika fokus audio hilang (misal ada telpon), pastikan pause Oboe juga
            when (focusChange) {
                AudioManager.AUDIOFOCUS_LOSS,
                AudioManager.AUDIOFOCUS_LOSS_TRANSIENT,
                AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> {
                    if (alwaysPauseOnInterruption) {
                        nativePause()
                    }
                }
                AudioManager.AUDIOFOCUS_GAIN -> {
                    // Bisa diaktifkan ulang sesuai state UI
                }
            }
        }
    }
}
