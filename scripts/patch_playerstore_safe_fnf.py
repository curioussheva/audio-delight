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
# STEP 1: Tambah safeFireAndForget helper setelah timedCall
# ═══════════════════════════════════════════════════════════
helper_marker = "// ─────────────────────────────────────────────\n// 🔥 PERF TELEMETRY HELPER"

if "function safeFireAndForget" not in c:
    # Cari akhir timedCall function (baris dengan "}\n" setelah return final)
    anchor = "  return final;\n  } catch (e) {\n    const ms = Date.now() - t0;\n    console.error(`[PERF] ${label}: FAILED in ${ms}ms`, e);\n    throw e;\n  }\n}"

    helper_block = anchor + """

// ─────────────────────────────────────────────
// 🔥 SAFE FIRE-AND-FORGET
// Handle both sync (void) and async (Promise) native methods.
// ─────────────────────────────────────────────
function safeFireAndForget(fn: () => any, label: string): void {
  try {
    const result = fn();
    if (result && typeof result.then === "function") {
      (result as Promise<any>).catch((e: any) =>
        console.warn(`[Player] ${label} failed:`, e),
      );
    }
  } catch (e) {
    console.warn(`[Player] ${label} threw:`, e);
  }
}"""

    if anchor in c:
        c = c.replace(anchor, helper_block, 1)
        print("✅ Helper safeFireAndForget ditambahkan")
    else:
        print("⚠️  Anchor timedCall tidak ketemu — skip helper")
else:
    print("⚠️  Helper sudah ada")

# ═══════════════════════════════════════════════════════════
# STEP 2: Fix playSong updateMetadata + updatePlaybackState
# ═══════════════════════════════════════════════════════════
old_meta = '''      // 🔥 NEW: update MediaSession metadata (lock screen notification)
      NativePlaybackService.updateMetadata(
        playableSong.title ?? "Unknown Title",
        playableSong.artist ?? "Unknown Artist",
        playableSong.album ?? "",
        (playableSong.duration ?? 0) * 1000,
      ).catch((e: any) => console.warn("[Player] updateMetadata failed:", e));

      NativePlaybackService.updatePlaybackState(true, 0).catch((e: any) =>
        console.warn("[Player] updatePlaybackState failed:", e),
      );'''

new_meta = '''      // 🔥 FIX: safe fire-and-forget (support sync & async native method)
      safeFireAndForget(
        () =>
          NativePlaybackService.updateMetadata(
            playableSong.title ?? "Unknown Title",
            playableSong.artist ?? "Unknown Artist",
            playableSong.album ?? "",
            (playableSong.duration ?? 0) * 1000,
          ),
        "updateMetadata",
      );

      safeFireAndForget(
        () => NativePlaybackService.updatePlaybackState(true, 0),
        "updatePlaybackState",
      );'''

if old_meta in c:
    c = c.replace(old_meta, new_meta, 1)
    print("✅ Fix playSong: updateMetadata + updatePlaybackState")
else:
    print("⚠️  Pattern playSong media session tidak ketemu")

# ═══════════════════════════════════════════════════════════
# STEP 3: Fix setIsPlaying updatePlaybackState
# ═══════════════════════════════════════════════════════════
old_state = '''      // 🔥 NEW: sync playback state ke MediaSession
      const pos = get().position;
      NativePlaybackService.updatePlaybackState(isPlaying, pos * 1000).catch(
        () => {},
      );'''

new_state = '''      // 🔥 FIX: sync playback state ke MediaSession (safe)
      const pos = get().position;
      safeFireAndForget(
        () => NativePlaybackService.updatePlaybackState(isPlaying, pos * 1000),
        "updatePlaybackState",
      );'''

if old_state in c:
    c = c.replace(old_state, new_state, 1)
    print("✅ Fix setIsPlaying: updatePlaybackState")
else:
    print("⚠️  Pattern setIsPlaying tidak ketemu")

# ═══════════════════════════════════════════════════════════
# SAVE
# ═══════════════════════════════════════════════════════════
if c != original:
    FILE.write_text(c)
    print("")
    print("🎉 Patch selesai!")
else:
    print("")
    print("⚠️  Tidak ada perubahan")

