package com.pristineaudio

import android.content.ContentUris
import android.database.Cursor
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.media.MediaMetadataRetriever
import com.facebook.react.bridge.*

class MediaStoreModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "MediaStoreModule"
    
    private fun getAudioTechnicalInfo(uriString: String): WritableMap {
    val info = Arguments.createMap()
    val retriever = MediaMetadataRetriever()
    try {
        retriever.setDataSource(reactContext, Uri.parse(uriString))
        
        // 1. Bitrate (dalam bps, kita konversi ke kbps)
        val bitrate = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_BITRATE)
        info.putInt("bitrate", (bitrate?.toInt() ?: 0) / 1000)

        // 2. Samplerate & Bitdepth (Hanya tersedia di API 31+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val sr = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_SAMPLERATE)
            val bd = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_BITS_PER_SAMPLE)
            info.putInt("sampleRate", sr?.toInt() ?: 44100)
            info.putInt("bitDepth", bd?.toInt() ?: 16)
        } else {
            // Untuk API di bawah 31, kita beri nilai default atau 0
            // karena MediaMetadataRetriever standar tidak mendukungnya secara native
            info.putInt("sampleRate", 0) 
            info.putInt("bitDepth", 0)
        }
    } catch (e: Exception) {
        // Fallback jika gagal baca
        info.putInt("bitrate", 0)
        info.putInt("sampleRate", 0)
        info.putInt("bitDepth", 0)
    } finally {
        retriever.release()
    }
    return info
}


    @ReactMethod
    fun queryAudioFiles(promise: Promise) {
        try {
            val projection = mutableListOf(
                MediaStore.Audio.Media._ID,
                MediaStore.Audio.Media.DISPLAY_NAME,
                MediaStore.Audio.Media.TITLE,
                MediaStore.Audio.Media.ARTIST,
                MediaStore.Audio.Media.ALBUM,
                MediaStore.Audio.Media.ALBUM_ID,
                MediaStore.Audio.Media.DURATION,
                MediaStore.Audio.Media.DATE_ADDED,
                MediaStore.Audio.Media.YEAR,
                MediaStore.Audio.Media.TRACK,
                MediaStore.Audio.Media.MIME_TYPE,
                MediaStore.Audio.Media.SIZE,
            ).apply {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    add(MediaStore.Audio.Media.RELATIVE_PATH)
                }
                // GENRE tersedia di Android 10+ (API 30 = R)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    add(MediaStore.Audio.Media.GENRE)
                }
            }.toTypedArray()

            val selection = "${MediaStore.Audio.Media.IS_MUSIC} != 0 AND " +
                "${MediaStore.Audio.Media.DURATION} > 10000"

            val sortOrder = "${MediaStore.Audio.Media.TITLE} ASC"

            val cursor: Cursor? = reactContext.contentResolver.query(
                MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
                projection,
                selection,
                null,
                sortOrder
            )

            val result = Arguments.createArray()

            cursor?.use { c ->
                val idCol       = c.getColumnIndexOrThrow(MediaStore.Audio.Media._ID)
                val nameCol     = c.getColumnIndexOrThrow(MediaStore.Audio.Media.DISPLAY_NAME)
                val titleCol    = c.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE)
                val artistCol   = c.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST)
                val albumCol    = c.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM)
                val albumIdCol  = c.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM_ID)
                val durationCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION)
                val dateCol     = c.getColumnIndexOrThrow(MediaStore.Audio.Media.DATE_ADDED)
                val yearCol     = c.getColumnIndexOrThrow(MediaStore.Audio.Media.YEAR)
                val trackCol    = c.getColumnIndexOrThrow(MediaStore.Audio.Media.TRACK)
                val mimeCol     = c.getColumnIndexOrThrow(MediaStore.Audio.Media.MIME_TYPE)
                val sizeCol     = c.getColumnIndexOrThrow(MediaStore.Audio.Media.SIZE)
                val relPathCol  = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
                    c.getColumnIndex(MediaStore.Audio.Media.RELATIVE_PATH) else -1
                val genreCol    = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R)
                    c.getColumnIndex(MediaStore.Audio.Media.GENRE) else -1

                while (c.moveToNext()) {
                    val id      = c.getLong(idCol)
                    val albumId = c.getLong(albumIdCol)

                    val contentUri = ContentUris.withAppendedId(
                        MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, id
                    ).toString()
                    
                    val techInfo = getAudioTechnicalInfo(contentUri)

                    val artworkUri = ContentUris.withAppendedId(
                        Uri.parse("content://media/external/audio/albumart"), albumId
                    ).toString()

                    val folder = if (relPathCol >= 0) {
                        c.getString(relPathCol)?.trimEnd('/')?.substringAfterLast('/') ?: "Music"
                    } else "Music"

                    val genre = if (genreCol >= 0) {
                        c.getString(genreCol)?.takeIf {
                            it.isNotBlank() && it != "<unknown>"
                        } ?: "Unknown Genre"
                    } else "Unknown Genre"

                    // ── Fix codec: prioritaskan extension filename ──────────
                    val filename = c.getString(nameCol) ?: ""
                    val ext      = filename.substringAfterLast('.', "").uppercase()
                    val mime     = c.getString(mimeCol) ?: "audio/mpeg"
                    val codec    = when (ext) {
                        "FLAC"       -> "FLAC"
                        "WAV"        -> "WAV"
                        "M4A", "MP4" -> "M4A"
                        "OGG"        -> "OGG"
                        "OPUS"       -> "OPUS"
                        "AAC"        -> "AAC"
                        "DSF", "DSD" -> "DSD"
                        "DFF"        -> "DFF"
                        "ALAC"       -> "ALAC"
                        "MP3"        -> "MP3"
                        else         -> when {
                            mime.contains("flac", true) -> "FLAC"
                            mime.contains("wav",  true) -> "WAV"
                            mime.contains("ogg",  true) -> "OGG"
                            mime.contains("opus", true) -> "OPUS"
                            mime.contains("mp4",  true) -> "M4A"
                            mime.contains("aac",  true) -> "AAC"
                            else                        -> "MP3"
                        }
                    }

                    val durationSec = c.getLong(durationCol) / 1000.0

                    val song = Arguments.createMap().apply {
                        putString("id",         id.toString())
                        putString("uri",        contentUri)
                        putString("filename",   filename)
                        putString("title",      c.getString(titleCol)?.takeIf { it.isNotBlank() }
                            ?: filename.substringBeforeLast('.'))
                        putString("artist",     c.getString(artistCol)?.takeIf {
                            it.isNotBlank() && it != "<unknown>"
                        } ?: "Unknown Artist")
                        putString("album",      c.getString(albumCol)?.takeIf {
                            it.isNotBlank() && it != "<unknown>"
                        } ?: "Unknown Album")
                        putString("artworkUri", artworkUri)
                        putString("folder",     folder)
                        putString("genre",      genre)
                        putString("codec",      codec)
                        putString("mimeType",   mime)
                        putDouble("duration",   durationSec)
                        putDouble("dateAdded",  c.getLong(dateCol).toDouble())
                        putDouble("fileSize",   c.getLong(sizeCol).toDouble())
                        putInt("year",          c.getInt(yearCol))
                        putInt("trackNumber",   c.getInt(trackCol) % 1000)
                        putInt("discNumber",    c.getInt(trackCol) / 1000)
                        putInt("bitrate", techInfo.getInt("bitrate"))
                        putInt("sampleRate", techInfo.getInt("sampleRate"))
                        putInt("bitDepth", techInfo.getInt("bitDepth"))
                    }

                    result.pushMap(song)
                }
            }

            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("MEDIASTORE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getAlbumArtUri(albumId: String, promise: Promise) {
        val uri = ContentUris.withAppendedId(
            Uri.parse("content://media/external/audio/albumart"),
            albumId.toLongOrNull() ?: 0L
        ).toString()
        promise.resolve(uri)
    }
} 
