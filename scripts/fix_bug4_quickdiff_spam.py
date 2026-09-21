#!/data/data/com.termux/files/usr/bin/python3
"""Fix Bug #4: quick diff spam."""
from pathlib import Path

FILE = Path.home() / "pristine/src/features/library/hooks/useScanManager.ts"
src = FILE.read_text()
changes = 0

# 1. Header
old1 = '''// Minimum interval antara resume scan — cegah spam saat app bolak-balik background
const RESUME_SCAN_COOLDOWN_MS = 30_000; // 30 detik'''
new1 = '''// Minimum interval antara resume scan
const RESUME_SCAN_COOLDOWN_MS = 60_000;  // 🔥 FIX Bug #4: 60s
const MIN_BACKGROUND_MS = 3_000;          // 🔥 FIX Bug #4: skip resume <3s di bg

// 🔥 FIX Bug #4: module-level state (survive across hook remount)
let _globalLastResumeScan = 0;
let _globalBackgroundedAt = 0;
let _globalLastResumeLog = 0;'''

if "_globalLastResumeScan" in src:
    print("⏭️  Bug #4 header already applied")
elif old1 in src:
    src = src.replace(old1, new1, 1)
    print("✅ [1/3] Module-level state added")
    changes += 1
else:
    print("❌ [1/3] Header pattern tidak match")

# 2. Listener opening
old2 = '''      if (nextState !== "active") return;
      if (isQuickDiffRunning.current) return;

      // ✅ Cooldown check — gunakan ref, bukan let variable
      const now = Date.now();
      if (now - lastResumeScan.current < RESUME_SCAN_COOLDOWN_MS) {
        console.log("[useScanManager] Resume scan cooldown active, skipping");
        return;
      }'''
new2 = '''      // 🔥 FIX Bug #4: track background duration (skip audio focus false positive)
      if (nextState === "background" || nextState === "inactive") {
        _globalBackgroundedAt = Date.now();
        return;
      }
      if (nextState !== "active") return;
      if (isQuickDiffRunning.current) return;

      const now = Date.now();

      // Skip kalau baru <3s di background
      if (_globalBackgroundedAt > 0 && now - _globalBackgroundedAt < MIN_BACKGROUND_MS) {
        return;
      }

      // Cooldown GLOBAL (bukan useRef)
      if (now - _globalLastResumeScan < RESUME_SCAN_COOLDOWN_MS) {
        if (now - _globalLastResumeLog > 10_000) {
          console.log("[useScanManager] Resume cooldown active (global), skip");
          _globalLastResumeLog = now;
        }
        return;
      }'''

if "_globalBackgroundedAt = Date.now();" in src:
    print("⏭️  Bug #4 listener already applied")
elif old2 in src:
    src = src.replace(old2, new2, 1)
    print("✅ [2/3] Listener guard added")
    changes += 1
else:
    print("❌ [2/3] Listener pattern tidak match")

# 3. Update timestamp
old3 = '''      isQuickDiffRunning.current = true;
      lastResumeScan.current = Date.now(); // ✅ update timestamp sebelum jalan'''
new3 = '''      isQuickDiffRunning.current = true;
      _globalLastResumeScan = Date.now(); // 🔥 module-level'''

if "_globalLastResumeScan = Date.now();" in src:
    print("⏭️  Bug #4 timestamp already applied")
elif old3 in src:
    src = src.replace(old3, new3, 1)
    print("✅ [3/3] Timestamp update")
    changes += 1
else:
    print("❌ [3/3] Timestamp pattern tidak match")

if changes > 0:
    FILE.write_text(src)
    print(f"\n{'='*50}\nTotal: {changes}/3\nFile: {FILE}")
else:
    print("\n⚠️  No changes") 