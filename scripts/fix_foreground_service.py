#!/data/data/com.termux/files/usr/bin/python3
"""Fix foreground service: manifest + PlaybackService + MediaSessionManager."""
from pathlib import Path

ROOT = Path.home() / "pristine"
changes = 0

# ══════════════════════════════════════════════════════
# 1. AndroidManifest.xml
# ══════════════════════════════════════════════════════
MF = ROOT / "android/app/src/main/AndroidManifest.xml"
src = MF.read_text()

# 1a. POST_NOTIFICATIONS
if "POST_NOTIFICATIONS" not in src:
    anchor = '<uses-permission android:name="android.permission.FOREGROUND_SERVICE"/>'
    if anchor in src:
        src = src.replace(
            anchor,
            anchor + '\n    <uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>',
            1
        )
        print("✅ [1a] POST_NOTIFICATIONS permission added")
        changes += 1
    else:
        print("❌ [1a] FOREGROUND_SERVICE marker tidak match")
else:
    print("⏭️  [1a] POST_NOTIFICATIONS already present")

# 1b. Service block
old_service = '''android:name="com.pristineaudio.playback.PlaybackService"
            android:foregroundServiceType="mediaPlayback"
            android:exported="true">

            <intent-filter>
                <action android:name="androidx.media.MediaBrowserServiceCompat"/>
            </intent-filter>
        </service>'''

new_service = '''android:name="com.pristineaudio.playback.PlaybackService"
            android:foregroundServiceType="mediaPlayback"
            android:exported="false"
            android:stopWithTask="false" />'''

if 'android:stopWithTask="false"' in src:
    print("⏭️  [1b] Service block already fixed")
elif old_service in src:
    src = src.replace(old_service, new_service, 1)
    print("✅ [1b] Service: exported=false, stopWithTask=false, intent-filter removed")
    changes += 1
else:
    print("❌ [1b] Service block pattern tidak match")
    print("     Paste 10 baris di sekitar 'PlaybackService' di AndroidManifest.xml")

MF.write_text(src)

# ══════════════════════════════════════════════════════
# 2. PlaybackService.kt
# ══════════════════════════════════════════════════════
PS = ROOT / "android/app/src/main/java/com/pristineaudio/playback/PlaybackService.kt"
src = PS.read_text()

# 2a. startForeground guard
old_start = '''    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        mediaSessionManager.startForeground()

        when (intent?.action) {'''

new_start = '''    private var isForegroundStarted = false

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // 🔥 FIX: panggil startForeground() HANYA SEKALI
        if (!isForegroundStarted) {
            mediaSessionManager.startForeground()
            isForegroundStarted = true
        }

        when (intent?.action) {'''

if "isForegroundStarted" in src:
    print("⏭️  [2a] onStartCommand guard already applied")
elif old_start in src:
    src = src.replace(old_start, new_start, 1)
    print("✅ [2a] startForeground() guarded")
    changes += 1
else:
    print("❌ [2a] onStartCommand pattern tidak match")

# 2b. onTaskRemoved
old_destroy = '''    override fun onDestroy() {
        mediaSessionManager.release()
        if (instance == this) instance = null
        super.onDestroy()
    }'''

new_destroy = '''    override fun onTaskRemoved(rootIntent: Intent?) {
        // 🔥 FIX: jangan stop service saat user swipe app dari recents
        android.util.Log.d("PlaybackService", "onTaskRemoved — service tetap jalan")
        super.onTaskRemoved(rootIntent)
    }

    override fun onDestroy() {
        mediaSessionManager.release()
        if (instance == this) instance = null
        super.onDestroy()
    }'''

if "onTaskRemoved" in src:
    print("⏭️  [2b] onTaskRemoved already present")
elif old_destroy in src:
    src = src.replace(old_destroy, new_destroy, 1)
    print("✅ [2b] onTaskRemoved override added")
    changes += 1
else:
    print("❌ [2b] onDestroy pattern tidak match")

PS.write_text(src)

# ══════════════════════════════════════════════════════
# 3. MediaSessionManager.kt
# ══════════════════════════════════════════════════════
MS = ROOT / "android/app/src/main/java/com/pristineaudio/playback/MediaSessionManager.kt"
src = MS.read_text()

# 3a. lastIsPlaying
if "lastIsPlaying" not in src:
    old = '    private var lastArtist: String = "Playing..."'
    new = '''    private var lastArtist: String = "Playing..."
    private var lastIsPlaying: Boolean = false'''
    if old in src:
        src = src.replace(old, new, 1)
        print("✅ [3a] lastIsPlaying field added")
        changes += 1
    else:
        print("❌ [3a] lastArtist marker tidak match")
else:
    print("⏭️  [3a] lastIsPlaying already present")

# 3b. updatePlaybackState
old_ups = '''    fun updatePlaybackState(isPlaying: Boolean, positionMs: Long) {
        val state = playbackStateBuilder'''
new_ups = '''    fun updatePlaybackState(isPlaying: Boolean, positionMs: Long) {
        lastIsPlaying = isPlaying
        val state = playbackStateBuilder'''
if "lastIsPlaying = isPlaying" in src:
    print("⏭️  [3b] lastIsPlaying update already present")
elif old_ups in src:
    src = src.replace(old_ups, new_ups, 1)
    print("✅ [3b] lastIsPlaying tracked")
    changes += 1
else:
    print("❌ [3b] updatePlaybackState pattern tidak match")

# 3c. Dynamic play/pause button
old_btn = '''        builder.addAction(
            android.R.drawable.ic_media_play,
            "Play",
            pendingIntentForAction(PlaybackService.ACTION_PLAY)
        )'''

new_btn = '''        // 🔥 FIX: tombol Play/Pause dynamic
        if (lastIsPlaying) {
            builder.addAction(
                android.R.drawable.ic_media_pause,
                "Pause",
                pendingIntentForAction(PlaybackService.ACTION_PAUSE)
            )
        } else {
            builder.addAction(
                android.R.drawable.ic_media_play,
                "Play",
                pendingIntentForAction(PlaybackService.ACTION_PLAY)
            )
        }'''

if "lastIsPlaying) {" in src and "ic_media_pause" in src:
    print("⏭️  [3c] Dynamic play/pause already present")
elif old_btn in src:
    src = src.replace(old_btn, new_btn, 1)
    print("✅ [3c] Dynamic Play/Pause button")
    changes += 1
else:
    print("❌ [3c] Play button pattern tidak match")

MS.write_text(src)

print(f"\n{'='*50}\nTotal: {changes} patches applied")
if changes < 6:
    print("⚠️  Ada yang gagal — paste output untuk debug")