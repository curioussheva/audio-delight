package com.pristineaudio.playback

import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import java.io.File

@ReactModule(name = NativePlaybackService.NAME)
class NativePlaybackService(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "NativePlaybackService"
    }

    override fun getName() = NAME

    @ReactMethod
    fun startService() {
        val intent = android.content.Intent(reactApplicationContext, PlaybackService::class.java)
        reactApplicationContext.startForegroundService(intent)
    }

    @ReactMethod
    fun stopService() {
        val intent = android.content.Intent(reactApplicationContext, PlaybackService::class.java)
        reactApplicationContext.stopService(intent)
    }

    @ReactMethod
    fun play() = PlaybackNativeBridge.play()

    @ReactMethod
    fun pause() = PlaybackNativeBridge.pause()

    @ReactMethod
    fun stop() = PlaybackNativeBridge.stop()

    @ReactMethod
    fun next() = PlaybackNativeBridge.next()

    @ReactMethod
    fun previous() = PlaybackNativeBridge.previous()

    @ReactMethod
    fun seek(positionMs: Double) = PlaybackNativeBridge.seek(positionMs.toLong())

    @ReactMethod
    fun setShuffle(enabled: Boolean) = PlaybackNativeBridge.setShuffle(enabled)

    @ReactMethod
    fun setRepeatMode(mode: Int) = PlaybackNativeBridge.setRepeatMode(mode)

    @ReactMethod
    fun setQueue(uris: ReadableArray) {
        val list = ArrayList<String>()
        for (i in 0 until uris.size()) {
            val raw = uris.getString(i) ?: continue
            val path = resolveContentUriToPath(raw)
            android.util.Log.d("NativePlaybackService", "setQueue raw=$raw path=$path")
            list.add(path)
        }
        PlaybackNativeBridge.setQueue(list.toTypedArray())
    }

    @ReactMethod
    fun getPosition(promise: Promise) {
        promise.resolve(PlaybackNativeBridge.getPosition().toDouble())
    }

    @ReactMethod
    fun getStatus(promise: Promise) {
        promise.resolve(PlaybackNativeBridge.getStatus())
    }

    @ReactMethod
    fun getQueue(promise: Promise) {
        val queue = PlaybackNativeBridge.getQueue()
        promise.resolve(queue?.toList() ?: emptyList<String>())
    }

    @ReactMethod
    fun getCurrentTrack(promise: Promise) {
        promise.resolve(PlaybackNativeBridge.getCurrentTrack() ?: "")
    }

    private fun resolveContentUriToPath(uriString: String): String {
        if (!uriString.startsWith("content://")) return uriString

        return try {
            val resolver = reactApplicationContext.contentResolver
            val uri = android.net.Uri.parse(uriString)

            resolver.query(uri, null, null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val idx = cursor.getColumnIndex(android.provider.MediaStore.MediaColumns.DATA)
                    if (idx >= 0) {
                        val path = cursor.getString(idx)
                        if (path != null) return path
                    }
                }
            }

            val inputStream = resolver.openInputStream(uri) ?: return uriString
            val file = File(reactApplicationContext.cacheDir, "audio_${System.currentTimeMillis()}.cache")
            file.outputStream().use { output ->
                inputStream.copyTo(output)
            }
            file.absolutePath
        } catch (e: Exception) {
            uriString
        }
    }
} 