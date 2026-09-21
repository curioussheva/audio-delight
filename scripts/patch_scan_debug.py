#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime
import shutil

ts = datetime.now().strftime("%Y%m%d_%H%M%S")

# ═══════════════════════════════════════════════════════════
# PATCH 1: _layout.tsx — Force reset stuck scan
# ═══════════════════════════════════════════════════════════
F1 = Path('src/app/_layout.tsx')
shutil.copy2(F1, f"{F1}.bak_{ts}")
c = F1.read_text()

# Cari setelah cache cleanup, tambah reset scan
anchor = '''    } catch (e) {
      console.warn("[BOOT] Cache cleanup skipped:", e);
    }

    const savedMode = await AsyncStorage.getItem("audio_mode_preference");'''

reset_block = '''    } catch (e) {
      console.warn("[BOOT] Cache cleanup skipped:", e);
    }

    // 🔥 FIX: Reset stuck scan state (anti macet)
    try {
      const { UnifiedScanService } = require("@/features/library/services/UnifiedScanService");
      const libraryStore = require("@/features/library/store/libraryStore").useLibraryStore.getState();
      
      let didReset = false;
      
      if (UnifiedScanService?.isRunning) {
        console.warn("[BOOT] 🚨 Reset UnifiedScanService.isRunning");
        UnifiedScanService.isRunning = false;
        UnifiedScanService.currentMode = null;
        UnifiedScanService.abortController = null;
        didReset = true;
      }
      
      if (libraryStore?.isManualScanning || libraryStore?.isAutoScanning) {
        console.warn("[BOOT] 🚨 Reset store scan state");
        libraryStore.finishManualScan?.();
        libraryStore.finishAutoScan?.();
        didReset = true;
      }
      
      if (didReset) {
        console.log("[BOOT] ✅ Stuck scan state reset");
      }
    } catch (e) {
      console.warn("[BOOT] Scan reset skipped:", e);
    }

    const savedMode = await AsyncStorage.getItem("audio_mode_preference");'''

if anchor in c:
    c = c.replace(anchor, reset_block, 1)
    F1.write_text(c)
    print("✅ Patch 1: _layout.tsx — force reset stuck scan")
else:
    print("⚠️  Patch 1: pattern tidak ketemu")

# ═══════════════════════════════════════════════════════════
# PATCH 2: useScanManager.ts — log di manualRescan
# ═══════════════════════════════════════════════════════════
F2 = Path('src/features/library/hooks/useScanManager.ts')
shutil.copy2(F2, f"{F2}.bak_{ts}")
c = F2.read_text()

old_manual = '''  const manualRescan = useCallback(
    async (onProgress?: (progress: ScanProgress) => void) => {
      if (isLocked || store.isManualScanning || store.isAutoScanning) {
        console.warn("[useScanManager] Scan locked or already running");
        throw new Error("Scan already in progress");
      }

      setIsLocked(true);
      try {
        return await UnifiedScanService.manualScan(onProgress);
      } finally {
        setIsLocked(false);
      }
    },
    [isLocked, store.isManualScanning, store.isAutoScanning],
  );'''

new_manual = '''  const manualRescan = useCallback(
    async (onProgress?: (progress: ScanProgress) => void) => {
      console.log("[useScanManager] manualRescan called");
      console.log("[useScanManager] - isLocked:", isLocked);
      console.log("[useScanManager] - isManualScanning:", store.isManualScanning);
      console.log("[useScanManager] - isAutoScanning:", store.isAutoScanning);

      if (isLocked || store.isManualScanning || store.isAutoScanning) {
        console.warn("[useScanManager] ❌ Scan locked or already running");
        throw new Error("Scan already in progress");
      }

      console.log("[useScanManager] ✅ Setting isLocked = true");
      setIsLocked(true);
      try {
        const result = await UnifiedScanService.manualScan(onProgress);
        console.log("[useScanManager] ✅ manualScan completed");
        return result;
      } catch (err) {
        console.error("[useScanManager] ❌ manualScan error:", err);
        throw err;
      } finally {
        console.log("[useScanManager] 🔚 Setting isLocked = false");
        setIsLocked(false);
      }
    },
    [isLocked, store.isManualScanning, store.isAutoScanning],
  );'''

if old_manual in c:
    c = c.replace(old_manual, new_manual, 1)
    F2.write_text(c)
    print("✅ Patch 2: useScanManager.ts — log manualRescan")
else:
    print("⚠️  Patch 2: pattern tidak ketemu")

print("")
print("🎉 Patch done!")
