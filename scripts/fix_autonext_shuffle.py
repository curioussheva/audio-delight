#!/data/data/com.termux/files/usr/bin/python3
"""v2: auto-next watcher baca posisi langsung dari native (robust)."""
from pathlib import Path

FILE = Path.home() / "pristine/src/features/player/store/playerStore.ts"
src = FILE.read_text()

old = '''    // 🔥 FIX Bug auto-next: polling track-ended (workaround sebelum native callback)
    // Cek setiap 1 detik: kalau pos >= duration - 500ms → playNext()
    if (!(globalThis as any).__trackEndWatcher) {
      (globalThis as any).__trackEndWatcher = setInterval(() => {
        const s = get();
        if (!s.isPlaying || !s.currentSong) return;
        const durMs = (s.currentSong.duration ?? 0) * 1000;
        if (durMs <= 0) return;
        // Trigger next kalau pos mendekati akhir (500ms tolerance)
        if (s.position >= durMs - 500 && s.position < durMs + 5000) {
          console.log(
            `[Player] 🎵 track ended (pos=${s.position}ms, dur=${durMs}ms) → next`,
          );
          // Debounce: majukan flag dulu biar tidak double-trigger
          set({ position: durMs + 10_000 });  // out of range
          get().playNext().catch((e) =>
            console.warn("[Player] auto-next failed:", e),
          );
        }
      }, 1000);
      console.log("[Player] 🎵 Auto-next watcher started");
    }'''

new = '''    // 🔥 FIX v2: auto-next watcher baca posisi LANGSUNG dari native
    // Tidak bergantung pada useAudioPlayer mounted atau tidak.
    // Overhead: 1 native call per detik (negligible).
    if (!(globalThis as any).__trackEndWatcher) {
      let _inFlight = false;
      (globalThis as any).__trackEndWatcher = setInterval(async () => {
        if (_inFlight) return;  // cegah overlap kalau native lambat
        const s = get();
        if (!s.isPlaying || !s.currentSong) return;
        const durMs = (s.currentSong.duration ?? 0) * 1000;
        if (durMs <= 0) return;

        _inFlight = true;
        try {
          const nativePosMs = await NativePlaybackService.getPosition();
          if (
            nativePosMs >= durMs - 500 &&
            nativePosMs < durMs + 5000
          ) {
            console.log(
              `[Player] 🎵 track ended (native=${nativePosMs}ms, dur=${durMs}ms) → next`,
            );
            await get().playNext();
          }
        } catch (e) {
          // silent — akan retry tick berikutnya
        } finally {
          _inFlight = false;
        }
      }, 1000);
      console.log("[Player] 🎵 Auto-next watcher started (native-based)");
    }'''

if "native-based" in src and "await NativePlaybackService.getPosition()" in src:
    print("⏭️  v2 already applied")
elif old in src:
    src = src.replace(old, new, 1)
    FILE.write_text(src)
    print(f"✅ v2 applied: native-based auto-next watcher\nFile: {FILE}")
else:
    print("❌ Pattern tidak match. Cek manual:")
    idx = src.find("__trackEndWatcher")
    if idx >= 0:
        print("─" * 50)
        print(src[idx-200:idx+1200])
        print("─" * 50)
    else:
        print("   ❌ Marker '__trackEndWatcher' tidak ditemukan!") 