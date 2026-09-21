#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime
import shutil

FILE = Path('src/features/library/services/UnifiedScanService.ts')
ts = datetime.now().strftime("%Y%m%d_%H%M%S")
shutil.copy2(FILE, f"{FILE}.bak_{ts}")
print(f"✅ Backup: {FILE}.bak_{ts}")

c = FILE.read_text()

# Cari pattern di manualScan
old_pattern = '''  const store = useLibraryStore.getState();
    const startTime = Date.now();

    try {
      store.startManualScan();

      onProgress?.({
        phase: "discover",
        current: 0,
        total: 0,
        message: "Scanning device...",
      });

      // ✅ ScanDiffEngine.runMediaStoreDiff() — bukan runMediaStoreDiff() langsung
      const diffResult = await ScanDiffEngine.runMediaStoreDiff(
        (current, total) => {
          onProgress?.({
            phase: "process",
            current,
            total,
            message: `Processing file ${current} of ${total}...`,
          });
        },
      );

      store.finishManualScan();

      const result: ScanResult = {
        mode: "full",
        level: 2,
        discovered: diffResult.totalScanned,
        added: diffResult.newCount,
        removed: diffResult.deletedCount,
        updated: diffResult.updatedCount || 0,
        enrichmentQueued: 0,
        duration: Date.now() - startTime,
        errors: [],
      };

      console.log(`✅ [UnifiedScan] Manual scan completed`, result);
      return result;
    } catch (error) {
      console.error("[UnifiedScan] Manual scan failed:", error);
      throw error;
    } finally {
      this.cleanup();
    }'''

new_pattern = '''  const store = useLibraryStore.getState();
    const startTime = Date.now();
    let result: ScanResult;

    try {
      store.startManualScan();

      onProgress?.({
        phase: "discover",
        current: 0,
        total: 0,
        message: "Scanning device...",
      });

      // ✅ ScanDiffEngine.runMediaStoreDiff() — bukan runMediaStoreDiff() langsung
      const diffResult = await ScanDiffEngine.runMediaStoreDiff(
        (current, total) => {
          onProgress?.({
            phase: "process",
            current,
            total,
            message: `Processing file ${current} of ${total}...`,
          });
        },
      );

      result = {
        mode: "full",
        level: 2,
        discovered: diffResult.totalScanned,
        added: diffResult.newCount,
        removed: diffResult.deletedCount,
        updated: diffResult.updatedCount || 0,
        enrichmentQueued: 0,
        duration: Date.now() - startTime,
        errors: [],
      };

      console.log(`✅ [UnifiedScan] Manual scan completed`, result);
      return result;
    } catch (error) {
      console.error("[UnifiedScan] Manual scan failed:", error);
      throw error;
    } finally {
      // 🔥 FIX: SELALU reset store state (anti stuck)
      store.finishManualScan();
      console.log("🔚 [UnifiedScan] finally: store.finishManualScan() called");
      
      this.cleanup();
    }'''

if old_pattern in c:
    c = c.replace(old_pattern, new_pattern, 1)
    FILE.write_text(c)
    print("✅ Fix applied: finishManualScan di finally")
else:
    print("⚠️  Pattern tidak ketemu — edit manual")
    print("   Cari: 'store.finishManualScan();' di manualScan")
