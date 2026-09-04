/**
 * useScanManager Hook
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { UnifiedScanService } from "../services/UnifiedScanService";
import { ScanDiffEngine } from "../services/ScanDiffEngine";
import { useLibraryStore } from "../store/libraryStore";
import { ScanProgress } from "../types/scan";
import { MetadataEnricher } from "../services/MetadataEnricher";

// Minimum interval antara resume scan — cegah spam saat app bolak-balik background
const RESUME_SCAN_COOLDOWN_MS = 30_000; // 30 detik

export function useScanManager() {
  const store = useLibraryStore();
  const hasInitialized = useRef(false);
  const isQuickDiffRunning = useRef(false);
  const lastResumeScan = useRef(0); // ✅ useRef, bukan let — persist antar render
  const [isLocked, setIsLocked] = useState(false);

  // ── Initial Scan hanya jika library kosong ──────────────────────────────────
  useEffect(() => {
  if (hasInitialized.current) return;
  hasInitialized.current = true;

  const timer = setTimeout(async () => {
    const currentStore = useLibraryStore.getState();

    if (currentStore.tracks.length === 0) {
      console.log(
        "[useScanManager] Fresh/empty library → Running initial MANUAL (DEEP) Scan",
      );
      
      setIsLocked(true); // 🔒 Kunci state lokal UI
      try {
        await UnifiedScanService.manualScan();
      } catch (err) {
        console.warn("[useScanManager] Initial scan error:", err);
      } finally {
        setIsLocked(false); // 🔓 Pastikan selalu di-unlock setelah selesai/error
      }
    } else {
      console.log(
        "[useScanManager] Library already exists → Skipping initial scan",
      );
    }
  }, 1000);

  return () => clearTimeout(timer);
}, []);

  // ── Quick Diff saat App Resume ──────────────────────────────────────────────
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const subscription = AppState.addEventListener("change", (nextState) => {
      // ✅ param = nextState
      if (nextState !== "active") return;
      if (isQuickDiffRunning.current) return;

      // ✅ Cooldown check — gunakan ref, bukan let variable
      const now = Date.now();
      if (now - lastResumeScan.current < RESUME_SCAN_COOLDOWN_MS) {
        console.log("[useScanManager] Resume scan cooldown active, skipping");
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
        lastResumeScan.current = Date.now(); // ✅ update timestamp sebelum jalan
        console.log("[useScanManager] App resumed → Running quick diff...");

        try {
          const diffResult = await ScanDiffEngine.quickDiff();

          if (diffResult.newCount > 0 || diffResult.deletedCount > 0) {
            console.log(
              `[useScanManager] Changes detected! New: ${diffResult.newCount}, Deleted: ${diffResult.deletedCount}`,
            );

            const storeInstance = useLibraryStore.getState();
            storeInstance.finishAutoScan?.();

            if (diffResult.newSongs?.length > 0) {
              await MetadataEnricher.queueSongs(
                diffResult.newSongs.map((s) => ({ id: s.id, uri: s.uri })),
              );
            }
          } else {
            console.log("[useScanManager] No changes detected");
          }
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
