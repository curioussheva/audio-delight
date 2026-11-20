package com.pristineaudio.widget

import com.pristineaudio.playback.PlaybackService

// State playback yang ditampilkan widget home screen (4x1).
// Murni data + fungsi murni (tanpa framework Android di luar konstanta aksi):
// keputusan tombol play/pause dan teks fallback tinggal di sini supaya
// perilakunya satu sumber — provider hanya merender, MediaSessionManager
// hanya memublikasikan.
data class WidgetPlaybackState(
    val title: String,
    val artist: String,
    val isPlaying: Boolean,
) {
    companion object {
        val EMPTY = WidgetPlaybackState(title = "PristineAudio", artist = "", isPlaying = false)
    }
}

// Aksi yang dikirim tombol play/pause widget: toggle sesuai state saat ini.
// Memakai konstanta yang sama dengan notifikasi (PlaybackService.ACTION_*),
// jadi widget tidak pernah membangun jalur playback kedua.
fun widgetToggleAction(isPlaying: Boolean): String =
    if (isPlaying) PlaybackService.ACTION_PAUSE else PlaybackService.ACTION_PLAY

// Judul kosong (mis. queue tanpa metadata) tidak boleh tampil sebagai
// baris kosong di widget — fallback ke nama app.
fun widgetDisplayTitle(state: WidgetPlaybackState): String =
    state.title.ifBlank { "PristineAudio" }

// true kalau ada yang berubah di tampilan widget. Dipakai store untuk
// menahan update yang tidak perlu — updatePlaybackState() menembak ~1/detik
// (position watcher), dan tiap updateAppWidget adalah IPC ke launcher.
fun widgetStateChanged(old: WidgetPlaybackState?, new: WidgetPlaybackState): Boolean =
    old != new
