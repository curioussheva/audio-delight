#!/data/data/com.termux/files/usr/bin/python3
"""Fix Bug #1: dedupe concurrent playSong — cegah crash saat tap cepat."""
from pathlib import Path

FILE = Path.home() / "pristine/src/features/player/store/playerStore.ts"
content = FILE.read_text()
changes = 0

# ─────────────────────────────────────────────────────────
# 1. Module-level dedupe state
# ─────────────────────────────────────────────────────────
old_mod = "let _positionSaveTimer: ReturnType<typeof setTimeout> | null = null;"
new_mod = """let _positionSaveTimer: ReturnType<typeof setTimeout> | null = null;

// 🔥 FIX Bug #1: dedupe concurrent playSong (crash saat tap cepat)
const _playInFlightSongIds = new Set<string>();
let _lastPlayRequest: { songId: string; ts: number } | null = null;"""

if "_playInFlightSongIds" in content:
    print("⏭️  Module state already present")
elif old_mod in content:
    content = content.replace(old_mod, new_mod, 1)
    print("✅ [1/2] Module-level state added")
    changes += 1
else:
    print("❌ Module marker not found")
    raise SystemExit(1)

# ─────────────────────────────────────────────────────────
# 2. Dedupe guard di playSong
# ─────────────────────────────────────────────────────────
old_start = """    if (!song?.id) {
      console.error("[Player] playSong: invalid song");
      set({ playError: "Invalid song" });
      return false;
    }

    const state = get();
"""
new_start = """    if (!song?.id) {
      console.error("[Player] playSong: invalid song");
      set({ playError: "Invalid song" });
      return false;
    }

    // 🔥 FIX Bug #1: dedupe concurrent playSong (cegah crash saat tap cepat)
    // Layer 1: cek in-flight (Set) — kalau ada play yang sedang jalan, skip
    if (_playInFlightSongIds.has(song.id)) {
      console.log(`[Player] 🚫 dedupe playSong (in-flight): ${song.id}`);
      return true;
    }
    // Layer 2: cek rapid re-tap — kalau < 1s, skip juga
    {
      const _now = Date.now();
      if (
        _lastPlayRequest?.songId === song.id &&
        _now - _lastPlayRequest.ts < 1000
      ) {
        console.log(`[Player] 🚫 dedupe playSong (rapid re-tap): ${song.id}`);
        return true;
      }
      _lastPlayRequest = { songId: song.id, ts: _now };
      _playInFlightSongIds.add(song.id);
      // Safety cleanup: auto-release setelah 20s (max durasi setQueue terlihat 15s)
      setTimeout(() => _playInFlightSongIds.delete(song.id), 20_000);
    }

    const state = get();
"""

if "dedupe playSong (in-flight)" in content:
    print("⏭️  Dedupe guard already present")
elif old_start in content:
    content = content.replace(old_start, new_start, 1)
    print("✅ [2/2] Dedupe guard added in playSong")
    changes += 1
else:
    print("❌ Start pattern not found")
    raise SystemExit(1)

if changes > 0:
    FILE.write_text(content)
    print(f"\n{'='*50}\nTotal: {changes} patch applied\nFile: {FILE}")
else:
    print("\n⚠️  No changes — semua sudah diterapkan?")