/**
 * useScanManager Hook - Versi yang sesuai dengan LibraryState baru
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { UnifiedScanService } from "../services/UnifiedScanService";
import { ScanDiffEngine } from "../services/ScanDiffEngine";
import { useLibraryStore } from "../store/libraryStore";
import { ScanProgress } from "../types/scan";
import { MetadataEnricher } from "../services/MetadataEnricher";

export function useScanManager() {
  const store = useLibraryStore();
  const hasInitialized = useRef(false);
  const isQuickDiffRunning = useRef(false);
  const [isLocked, setIsLocked] = useState(false);

  // Initial Scan hanya jika library kosong
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const timer = setTimeout(async () => {
      const currentStore = useLibraryStore.getState();

      if (currentStore.tracks.length === 0) {
        console.log(
          "[useScanManager] Fresh/empty library → Running initial Quick Scan",
        );
        await UnifiedScanService.autoScan().catch(console.warn);
      } else {
        console.log(
          "[useScanManager] Library already exists → Skipping initial auto scan",
        );
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  // Quick Diff saat App Resume
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      if (isQuickDiffRunning.current) return;

      clearTimeout(timeoutId);
      timeoutId = setTimeout(async () => {
        const currentStore = useLibraryStore.getState();

        if (currentStore.isManualScanning || currentStore.isAutoScanning) {
          console.log("[useScanManager] Scan is running, skip quick diff");
          return;
        }

        isQuickDiffRunning.current = true;
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
                diffResult.newSongs.map((s) => ({
                  id: s.id,
                  uri: s.uri,
                })),
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

  // Derived values (langsung dari store flat)
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
