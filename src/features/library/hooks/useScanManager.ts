/**
 * useScanManager Hook
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { UnifiedScanService } from "../services/UnifiedScanService";
import { ScanDiffEngine } from "../services/ScanDiffEngine";
import { runInitialScan } from "../services/initialScan";
import { useLibraryStore } from "../store/libraryStore";
import { ScanProgress } from "../types/scan";
import { shouldRunInitialScan } from "../services/initialScanGuard";
import { handleResumeDiffResult } from "../services/resumeEnrichment";
import {
  MIN_BACKGROUND_MS,
  RESUME_SCAN_COOLDOWN_MS,
  shouldRunResumeRefresh,
} from "../services/resumeRefreshGuard";

// Diekspor ulang supaya pemicu refresh foreground lain (library.tsx)
// tetap bisa mengimpor dari sini; definisi tinggal di resumeRefreshGuard.
export { MIN_BACKGROUND_MS, RESUME_SCAN_COOLDOWN_MS };

// 🔥 FIX Bug #4: module-level state (survive across hook remount)
let _globalLastResumeScan = 0;
let _globalBackgroundedAt = 0;
let _globalLastResumeLog = 0;

export function useScanManager() {
  const store = useLibraryStore();
  const hasInitialized = useRef(false);
  const isQuickDiffRunning = useRef(false);
  const [isLocked, setIsLocked] = useState(false);

  // ── Initial Scan hanya jika library kosong ──────────────────────────────────
  // S1: fresh install WAJIB quickscan — SATU KALI, metadata minimal (satu
  // query MediaStore via quickDiff), lalu tandai selesai.
  // BUKAN deep scan: kode lama yang dikomen memanggil
  // UnifiedScanService.manualScan() (full diff) — sengaja TIDAK dipulihkan.
  // quickDiff dipanggil dengan bypassAutoScanGate karena toggle auto-scan
  // default OFF; scan perdana jalan terlepas dari toggle itu.
  // Delay 1 dtk dipertahankan dari kode lama: memberi waktu rehydrate
  // zustand-persist (tracks dari AsyncStorage) + izin media dari
  // performInitialization, supaya tracks.length tidak dibaca saat store
  // masih kosong padahal library sebenarnya sudah ada.
  // startAutoScan/finishAutoScan: menyalakan status scan yang sudah ada
  // supaya EmptyLibrary menampilkan "Memindai..." selama quickDiff jalan
  // (quickDiff sendiri tidak melaporkan progres — lihat S4) dan supaya
  // resume quickDiff lain tidak tumpang tindih selama scan perdana jalan.
  // Rantai lengkapnya ada di services/initialScan.ts (runInitialScan):
  // quickDiff → setTracks → handleResumeDiffResult (antre lagu baru +
  // jalankan worker enrichment). Dipisah supaya rantai itu bisa diuji
  // tanpa me-render hook.
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const timer = setTimeout(async () => {
      const currentStore = useLibraryStore.getState();

      if (
        !shouldRunInitialScan({
          trackCount: currentStore.tracks.length,
          hasCompletedInitialScan: currentStore.hasCompletedInitialScan,
          isManualScanning: currentStore.isManualScanning,
          isAutoScanning: currentStore.isAutoScanning,
        })
      ) {
        return;
      }

      console.log(
        "[useScanManager] Fresh/empty library → Running initial quick scan",
      );
      setIsLocked(true);
      try {
        await runInitialScan(currentStore);
      } catch (err) {
        console.warn("[useScanManager] Initial scan error:", err);
      } finally {
        currentStore.finishAutoScan();
        setIsLocked(false);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  // ── Quick Diff saat App Resume ──────────────────────────────────────────────
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const subscription = AppState.addEventListener("change", (nextState) => {
      // ✅ param = nextState
      // 🔥 FIX Bug #4: track background duration (skip audio focus false positive)
      if (nextState === "background" || nextState === "inactive") {
        _globalBackgroundedAt = Date.now();
        return;
      }
      if (nextState !== "active") return;
      if (isQuickDiffRunning.current) return;

      const now = Date.now();

      // J3-1: predikat penjaga bersama library.tsx (resumeRefreshGuard).
      const resumeDecision = shouldRunResumeRefresh({
        backgroundedAt: _globalBackgroundedAt,
        lastRunAt: _globalLastResumeScan,
        now,
      });
      if (resumeDecision !== "ok") {
        if (
          resumeDecision === "cooldown" &&
          now - _globalLastResumeLog > 10_000
        ) {
          console.log("[useScanManager] Resume cooldown active (global), skip");
          _globalLastResumeLog = now;
        }
        return;
      }

      clearTimeout(timeoutId);
      // Debounce 800ms — jika user cepat kembali ke background lagi, tidak jalan
      timeoutId = setTimeout(async () => {
        const currentStore = useLibraryStore.getState();

        if (currentStore.isManualScanning || currentStore.isAutoScanning) {
          console.log("[useScanManager] Scan is running, skip quick diff");
          return;
        }

        isQuickDiffRunning.current = true;
        _globalLastResumeScan = Date.now(); // ✅ update timestamp sebelum jalan
        console.log("[useScanManager] App resumed → Running quick diff...");

        try {
          const diffResult = await ScanDiffEngine.quickDiff();

          // S2: antre lagu baru + jalankan worker enrichment
          // (resumeEnrichment.ts) — sebelum S2 antrean hanya diisi,
          // tidak pernah diproses dari jalur live.
          await handleResumeDiffResult(diffResult);
        } catch (err) {
          console.warn("[useScanManager] Quick diff on resume failed:", err);
        } finally {
          isQuickDiffRunning.current = false;
        }
      }, 800);
    });

    return () => {
      subscription.remove();
      clearTimeout(timeoutId);
    };
  }, []);

  // ── Manual Rescan ───────────────────────────────────────────────────────────
  const manualRescan = useCallback(
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
  );

  // ── Enrich Metadata ─────────────────────────────────────────────────────────
  const enrichMetadata = useCallback(
    async (options?: {
      songIds?: string[];
      limit?: number;
      onProgress?: (
        current: number,
        total: number,
        songInfo?: { title?: string; artist?: string },
      ) => void;
    }) => {
      if (isLocked) throw new Error("Operation in progress");
      setIsLocked(true);
      try {
        return await UnifiedScanService.enrichMetadata(options || {});
      } finally {
        setIsLocked(false);
      }
    },
    [isLocked],
  );

  const cancelScan = useCallback(() => {
    UnifiedScanService.cancel?.();
    setIsLocked(false);
  }, []);

  // ── Derived values ──────────────────────────────────────────────────────────
  const isManualScanning = store.isManualScanning;
  const isAutoScanning = store.isAutoScanning;
  const isEnriching = store.isEnriching;
  const manualScanProgress = store.manualScanProgress;
  const enrichmentProgress = store.enrichmentProgress;
  const enrichmentQueueSize = store.enrichmentQueueSize;
  const unenrichedCount = store.unenrichedCount;
  const lastScanAt = store.lastScanAt;
  const hasPendingEnrichment = unenrichedCount > 0 || enrichmentQueueSize > 0;
  const canScan = !isLocked && !isManualScanning && !isAutoScanning;

  return {
    isAutoScanning,
    isManualScanning,
    isEnriching,
    isLocked,
    manualScanProgress,
    enrichmentProgress,
    enrichmentQueueSize,
    unenrichedCount,
    lastScanAt,
    hasPendingEnrichment,
    canScan,
    isBackgroundEnriching: enrichmentQueueSize > 0 && !isEnriching,
    manualRescan,
    enrichMetadata,
    cancelScan,
    autoScanProgress: store.autoScanProgress,
    lastEnrichmentAt: store.lastEnrichmentAt,
  };
}
 