package com.pristineaudio.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.widget.RemoteViews
import com.pristineaudio.app.R
import com.pristineaudio.playback.PlaybackService

// Widget home screen 4x1: artwork + judul (+ artis) + play/pause + next.
//
// TIDAK ADA polling: updatePeriodMillis = 0 di XML. Satu-satunya pemicu
// update adalah WidgetStateStore.publish(), yang dipanggil MediaSessionManager
// dari callback/state playback (updateMetadata, artwork selesai di-decode,
// play/pause berubah). Alasan: HyperOS battery saver bisa membekukan proses
// app — timer di proses app tidak bisa diandalkan; service foreground +
// callback MediaSession tetap jalan selama playback berlangsung.
//
// TIDAK ADA jalur playback kedua: semua tombol mengirim PendingIntent
// getService ke PlaybackService.ACTION_* yang sama dengan tombol notifikasi,
// dan PlaybackService mengeksekusinya di command thread yang sama.
class PristineAudioWidgetProvider : AppWidgetProvider() {

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
                ComponentName(context, PristineAudioWidgetProvider::class.java),
            )
            // Belum ada widget terpasang: jangan buang IPC.
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
            WidgetStateStore.withSnapshot(context) { state, artwork ->
                manager.updateAppWidget(appWidgetId, buildRemoteViews(context, state, artwork))
            }
        }

        private fun buildRemoteViews(
            context: Context,
            state: WidgetPlaybackState,
            artwork: Bitmap?,
        ): RemoteViews {
            val views = RemoteViews(context.packageName, R.layout.widget_pristine_audio)

            if (artwork != null && !artwork.isRecycled) {
                views.setImageViewBitmap(R.id.widget_artwork, artwork)
            } else {
                // Belum ada artwork (atau track tanpa cover): ikon app,
                // bukan kotak kosong.
                views.setImageViewResource(R.id.widget_artwork, R.mipmap.ic_launcher)
            }

            views.setTextViewText(R.id.widget_title, widgetDisplayTitle(state))
            views.setTextViewText(R.id.widget_artist, state.artist)

            val isPlaying = state.isPlaying
            views.setImageViewResource(
                R.id.widget_play_pause,
                if (isPlaying) android.R.drawable.ic_media_pause
                else android.R.drawable.ic_media_play,
            )
            views.setContentDescription(
                R.id.widget_play_pause,
                if (isPlaying) "Pause" else "Play",
            )
            views.setOnClickPendingIntent(
                R.id.widget_play_pause,
                servicePendingIntent(context, widgetToggleAction(isPlaying)),
            )

            views.setOnClickPendingIntent(
                R.id.widget_next,
                servicePendingIntent(context, PlaybackService.ACTION_NEXT),
            )

            // Tap bagian lain widget membuka app.
            views.setOnClickPendingIntent(R.id.widget_root, activityPendingIntent(context))

            return views
        }

        // Pola yang sama dengan MediaSessionManager.pendingIntentForAction:
        // intent ke PlaybackService, requestCode dari hash aksi, IMMUTABLE.
        private fun servicePendingIntent(context: Context, action: String): PendingIntent {
            val intent = Intent(context, PlaybackService::class.java).apply {
                this.action = action
            }
            return PendingIntent.getService(
                context,
                action.hashCode(),
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
        }

        private fun activityPendingIntent(context: Context): PendingIntent {
            val launch = context.packageManager
                .getLaunchIntentForPackage(context.packageName)
                ?.apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_CLEAR_TOP or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP
                }
            val intent = launch ?: Intent().apply {
                setClassName(context.packageName, "com.pristineaudio.app.MainActivity")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            return PendingIntent.getActivity(
                context,
                0,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
        }
    }
}
