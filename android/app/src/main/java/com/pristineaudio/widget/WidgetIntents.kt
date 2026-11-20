package com.pristineaudio.widget

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import com.pristineaudio.playback.PlaybackService

// Helper PendingIntent yang dipakai kedua provider widget (4x1 dan besar).
// Pola yang sama dengan MediaSessionManager.pendingIntentForAction: intent
// ke PlaybackService, requestCode dari hash aksi, IMMUTABLE. Dipisah ke
// sini supaya kedua provider membangun intent yang IDENTIK (tombol yang
// sama = PendingIntent yang sama) tanpa menduplikasi kode.

fun widgetServicePendingIntent(context: Context, action: String): PendingIntent {
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

fun widgetActivityPendingIntent(context: Context): PendingIntent {
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
