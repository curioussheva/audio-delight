#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime
import shutil

FILE = Path('src/features/player/store/playerStore.ts')
ts = datetime.now().strftime("%Y%m%d_%H%M%S")
shutil.copy2(FILE, f"{FILE}.bak_{ts}")
print(f"✅ Backup: {FILE}.bak_{ts}")

c = FILE.read_text()
original = c

# ═══════════════════════════════════════════════════════════
# FIX 1: initStore — explicit isPlaying: false
# ═══════════════════════════════════════════════════════════
old_init = '''          // 🟢 Cukup pulihkan state di React/Zustand.
          // JANGAN panggil NativePlaybackService.setQueue di sini agar tidak memicu permission leak.
          set({
            queue: restoredQueue,
            currentSong,
            position: lastPosition,
          });'''

new_init = '''          // 🟢 Restore state di React/Zustand.
          // Native queue TIDAK di-restore di sini (mahal + permission leak).
          // Akan di-restore lazy saat user tap play.
          set({
            queue: restoredQueue,
            currentSong,
            position: lastPosition,
            isPlaying: false,   // 🔥 Explicit: native tidak playing
          });

          console.log(
            `[Player] 🔄 Restored state: "${currentSong.title}", queue=${restoredQueue.length}, pos=${lastPosition}s`
          );
          console.log("[Player] ⚠️  Native queue empty — re-sync on play");'''

if old_init in c:
    c = c.replace(old_init, new_init, 1)
    print("✅ Fix 1: initStore — isPlaying=false + log")
else:
    print("⚠️  Fix 1 pattern tidak ketemu")

# ═══════════════════════════════════════════════════════════
# FIX 2: playSong — resume position setelah play
# ═══════════════════════════════════════════════════════════

# Cari block set state setelah play
old_state = '''      set({
        currentSong: playableSong,
        queue: targetQueue,
        isPlaying: true,
        position: 0,
        playError: null,
      });'''

new_state = '''      // 🔥 RESTORE POSITION: kalau resume after restart
      const isResumeAfterRestart =
        state.currentSong?.id === playableSong.id &&
        state.position > 0;

      const resumePosition = isResumeAfterRestart ? state.position : 0;

      set({
        currentSong: playableSong,
        queue: targetQueue,
        isPlaying: true,
        position: resumePosition,
        playError: null,
      });

      // 🔥 Seek ke restored position (setelah decoder siap)
      if (resumePosition > 0) {
        console.log(`[Player] 🔄 Resume from position: ${resumePosition}s`);
        setTimeout(async () => {
          try {
            await NativePlaybackService.seek(resumePosition * 1000);
            console.log(`[Player] ✅ Seek to ${resumePosition}s done`);
          } catch (e) {
            console.warn("[Player] Restore seek failed:", e);
          }
        }, 500);  // delay 500ms biar decoder siap
      }'''

if old_state in c:
    c = c.replace(old_state, new_state, 1)
    print("✅ Fix 2: playSong — resume position")
else:
    print("⚠️  Fix 2 pattern tidak ketemu")

# ═══════════════════════════════════════════════════════════
# SAVE
# ═══════════════════════════════════════════════════════════
if c != original:
    FILE.write_text(c)
    print("")
    print("🎉 Full restore patch applied!")
else:
    print("")
    print("⚠️  Tidak ada perubahan")

