package com.pristineaudio.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.graphics.Bitmap
import android.view.View
import android.widget.RemoteViews
import com.pristineaudio.app.R
import com.pristineaudio.playback.PlaybackService

// Widget home screen BESAR PristineAudio (target 4x4, bisa di-resize):
// artwork besar sebagai elemen dominan + judul (2 baris) + artis +
// progress bar (posisi/durasi) + transport lengkap (previous / play-pause /
// next). Tap badan membuka app.
//
// Provider kedua, BUKAN pengganti 4x1: widget 4x1 tidak diubah sama sekali.
// Keduanya membaca state yang SAMA dari WidgetStateStore (satu sumber
// kebenaran) dan di-update oleh publish() yang sama — tidak ada mekanisme
// update kedua, tidak ada polling (updatePeriodMillis = 0 di XML).
//
// Progress bar: posisi mengalir dari position watcher JS (~1/detik, lewat
// MediaSessionManager.updatePlaybackState) — jalur yang sudah ada, bukan
// timer baru. Saat JS mati (app di-swipe, service tetap hidup), progress
// membeku di posisi terakhir sampai app dibuka lagi; judul/artis/play-pause
// tetap benar karena datang dari callback MediaSession. Sama seperti 4x1,
// itu keterbatasan sistem, bukan bug widget.
//
// TIDAK ADA seek di progress bar (RemoteViews ProgressBar tidak bisa
// di-drag), dan TIDAK ADA toggle shuffle/repeat: PlaybackService tidak
// punya ACTION_SHUFFLE/ACTION_REPEAT — toggle butuh aksi service +
// pemanggilan native + sync JS baru, di luar batas tugas ini.
class PristineAudioWidgetLargeProvider : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
    ) {
        for (appWidgetId in appWidgetIds) {
            updateOne(context, appWidgetManager, appWidgetId)
        }
    }

    companion object {
        fun updateAll(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(
                ComponentName(context, PristineAudioWidgetLargeProvider::class.java),
            )
            // Belum ada widget besar terpasang: jangan buang IPC.
            if (ids.isEmpty()) return
            for (appWidgetId in ids) {
                updateOne(context, manager, appWidgetId)
            }
        }

        private fun updateOne(
            context: Context,
            manager: AppWidgetManager,
            appWidgetId: Int,
        ) {
            WidgetStateStore.withLargeSnapshot(context) { state, artwork ->
                manager.updateAppWidget(appWidgetId, buildRemoteViews(context, state, artwork))
            }
        }

        private fun buildRemoteViews(
            context: Context,
            state: WidgetPlaybackState,
            artwork: Bitmap?,
        ): RemoteViews {
            val views = RemoteViews(context.packageName, R.layout.widget_pristine_audio_large)

            if (artwork != null && !artwork.isRecycled) {
                views.setImageViewBitmap(R.id.widget_large_artwork, artwork)
            } else {
                // Belum ada artwork (atau track tanpa cover): ikon app,
                // bukan kotak kosong.
                views.setImageViewResource(R.id.widget_large_artwork, R.mipmap.ic_launcher)
            }

            views.setTextViewText(R.id.widget_large_title, widgetDisplayTitle(state))
            views.setTextViewText(R.id.widget_large_artist, state.artist)

            // Progress: detik penuh (state sudah terkuantisasi ke detik di
            // MediaSessionManager). Durasi tidak diketahui (0) → baris
            // progress disembunyikan, bukan menampilkan 0:00 / 0:00.
            val durationSec = (state.durationMs / 1000).toInt().coerceAtLeast(0)
            if (durationSec > 0) {
                val positionSec = (state.positionMs / 1000).toInt()
                    .coerceIn(0, durationSec)
                views.setViewVisibility(R.id.widget_large_progress_row, View.VISIBLE)
                views.setProgressBar(
                    R.id.widget_large_progress,
                    durationSec,
                    positionSec,
                    false,
                )
                views.setTextViewText(
                    R.id.widget_large_position,
                    formatWidgetTime(state.positionMs),
                )
                views.setTextViewText(
                    R.id.widget_large_duration,
                    formatWidgetTime(state.durationMs),
                )
            } else {
                views.setViewVisibility(R.id.widget_large_progress_row, View.GONE)
            }

            val isPlaying = state.isPlaying
            views.setImageViewResource(
                R.id.widget_large_play_pause,
                if (isPlaying) android.R.drawable.ic_media_pause
                else android.R.drawable.ic_media_play,
            )
            views.setContentDescription(
                R.id.widget_large_play_pause,
                if (isPlaying) "Pause" else "Play",
            )
            views.setOnClickPendingIntent(
                R.id.widget_large_previous,
                widgetServicePendingIntent(context, PlaybackService.ACTION_PREVIOUS),
            )
            views.setOnClickPendingIntent(
                R.id.widget_large_play_pause,
                widgetServicePendingIntent(context, widgetToggleAction(isPlaying)),
            )
            views.setOnClickPendingIntent(
                R.id.widget_large_next,
                widgetServicePendingIntent(context, PlaybackService.ACTION_NEXT),
            )

            // Tap bagian lain widget membuka app.
            views.setOnClickPendingIntent(
                R.id.widget_large_root,
                widgetActivityPendingIntent(context),
            )

            return views
        }
    }
}
