package com.pristineaudio.widget

import com.pristineaudio.playback.PlaybackService

// State playback yang ditampilkan widget home screen (4x1 dan besar).
// Murni data + fungsi murni (tanpa framework Android di luar konstanta aksi):
// keputusan tombol play/pause dan teks fallback tinggal di sini supaya
// perilakunya satu sumber — provider hanya merender, MediaSessionManager
// hanya memublikasikan.
//
// positionMs/durationMs dipakai widget BESAR untuk progress bar. positionMs
// disimpan terkuantisasi ke detik penuh (MediaSessionManager yang membulatkan)
// supaya state berubah paling sering 1/detik saat lagu jalan — progress yang
// bergerak memang butuh update segitu, tapi tidak lebih. Saat pause, posisi
// membeku sehingga store menahan update (tidak ada IPC ke launcher).
data class WidgetPlaybackState(
    val title: String,
    val artist: String,
    val isPlaying: Boolean,
    val positionMs: Long = 0L,
    val durationMs: Long = 0L,
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

// true kalau identitas trek/state berubah (judul, artis, play/pause,
// durasi) — BUKAN posisi. Dipakai store untuk memutuskan persistensi:
// posisi berubah tiap detik saat lagu jalan dan tidak perlu ditulis ke
// SharedPreferences (hanya di cache memori); identitas yang berubah
// yang dipersist supaya widget tetap benar sesudah proses mati.
fun widgetIdentityChanged(old: WidgetPlaybackState?, new: WidgetPlaybackState): Boolean =
    old == null ||
        old.title != new.title ||
        old.artist != new.artist ||
        old.isPlaying != new.isPlaying ||
        old.durationMs != new.durationMs

// Format waktu progress widget: "m:ss", atau "h:mm:ss" untuk trek panjang
// (>= 1 jam — pustaka user punya trek 2 jam lebih). Nilai negatif dijepit 0.
fun formatWidgetTime(ms: Long): String {
    val totalSeconds = (ms.coerceAtLeast(0L) / 1000).toInt()
    val hours = totalSeconds / 3600
    val minutes = (totalSeconds % 3600) / 60
    val seconds = totalSeconds % 60
    return if (hours > 0) {
        "%d:%02d:%02d".format(hours, minutes, seconds)
    } else {
        "%d:%02d".format(minutes, seconds)
    }
}
