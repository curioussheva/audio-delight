/**
 * src/features/library/services/UnifiedScanService.ts
 */

// ✅ Import ScanDiffEngine sebagai object — quickDiff dan runMediaStoreDiff
//    adalah methods, bukan named exports
import { ScanDiffEngine } from "./ScanDiffEngine";
import { MetadataEnricher } from "./MetadataEnricher";
import { useLibraryStore } from "../store/libraryStore";
import { ScanResult, ScanProgress, EnrichmentLevel } from "../types/scan";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export class UnifiedScanService {
  private static isRunning = false;
  private static abortController: AbortController | null = null;
  private static currentMode: "auto" | "manual" | null = null;

  /**
   * AUTO SCAN - Lightweight scan for background/app launch (Level 1)
   */
  static async autoScan(): Promise<ScanResult> {
    if (this.isRunning) {
      console.log("[UnifiedScan] Auto scan already running, skipping");
      return this.emptyResult();
    }

    console.log("🚀 [UnifiedScan] Starting AUTO scan...");
    this.isRunning = true;
    this.currentMode = "auto";
    this.abortController = new AbortController();

    const store = useLibraryStore.getState();
    const startTime = Date.now();

    try {
      if (Platform.OS === "android") {
        await this.setupNotificationChannel();
        await this.showScanNotification("Scanning library...", 0, 100);
      }

      store.startAutoScan();

      // ✅ ScanDiffEngine.quickDiff() — bukan quickDiff() langsung
      const diffResult = await ScanDiffEngine.quickDiff();

      if (Platform.OS === "android") {
        await this.showScanNotification(
          `Found ${diffResult.newCount} new, ${diffResult.deletedCount} deleted`,
          100,
          100,
        );
      }

      store.finishAutoScan();

      if (diffResult.newSongs?.length > 0) {
        await MetadataEnricher.queueSongs(
          diffResult.newSongs.map((s) => ({
            id: s.id,
            uri: s.uri,
            priority: 0,
            level: 2 as EnrichmentLevel,
          })),
        );
        this.startBackgroundEnrichment();
      }

      const unenriched = store.getUnenrichedSongs?.() || [];
      store.setUnenrichedCount(unenriched.length);

      if (Platform.OS === "android") {
        setTimeout(
          () => Notifications.dismissAllNotificationsAsync().catch(() => {}),
          1500,
        );
      }

      const result: ScanResult = {
        mode: "quick",
        level: 1,
        discovered: diffResult.totalScanned,
        added: diffResult.newCount,
        removed: diffResult.deletedCount,
        updated: diffResult.updatedCount || 0,
        enrichmentQueued: diffResult.newCount,
        duration: Date.now() - startTime,
        errors: [],
      };

      console.log(`✅ [UnifiedScan] Auto scan completed`, result);
      return result;
    } catch (error) {
      console.error("[UnifiedScan] Auto scan failed:", error);
      throw error;
    } finally {
      this.cleanup();
    }
  }

  /**
   * MANUAL SCAN - Full scan with progress feedback (Level 2)
   */
  static async manualScan(
    onProgress?: (progress: ScanProgress) => void,
  ): Promise<ScanResult> {
    if (this.isRunning) {
      throw new Error("Scan already in progress. Please wait or cancel.");
    }

    console.log("🚀 [UnifiedScan] Starting MANUAL scan...");
    this.isRunning = true;
    this.currentMode = "manual";
    this.abortController = new AbortController();

    const store = useLibraryStore.getState();
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
      const diffResult = await ScanDiffEngine.runMediaStoreDiff((current, total) => {
        onProgress?.({
          phase: "process",
          current,
          total,
          message: `Processing file ${current} of ${total}...`,
        });
      });

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
    }
  }

  /**
   * METADATA ENRICHMENT (Level 2)
   */
  static async enrichMetadata(
    options: {
      songIds?: string[];
      limit?: number;
      onProgress?: (
        current: number,
        total: number,
        songInfo?: { title?: string; artist?: string },
      ) => void;
    } = {},
  ): Promise<{ processed: number; success: number; failed: number }> {
    const store = useLibraryStore.getState();
    let targetIds = options.songIds;

    if (!targetIds) {
      const unenriched = store.getUnenrichedSongs?.() || [];
      targetIds = unenriched.map((s: any) => s.id);
    }

    if (options.limit) targetIds = targetIds.slice(0, options.limit);

    if (targetIds.length === 0) {
      return { processed: 0, success: 0, failed: 0 };
    }

    console.log(`✨ [UnifiedScan] Starting enrichment for ${targetIds.length} songs...`);

    this.isRunning = true;
    this.currentMode = "auto";

    try {
      store.startEnrichment(2, targetIds.length);

      const result = await MetadataEnricher.enrichBatch(
        targetIds,
        (current, total, songInfo) => {
          store.updateEnrichmentProgress?.({
            level: 2 as EnrichmentLevel,
            current,
            total,
            currentSong: songInfo?.title,
            currentArtist: songInfo?.artist,
            success: current,
            failed: 0,
          });
          options.onProgress?.(current, total, songInfo);
        },
      );

      store.finishEnrichment();

      const remaining = store.getUnenrichedSongs?.() || [];
      store.setUnenrichedCount(remaining.length);

      return {
        processed: targetIds.length,
        success: result.success || 0,
        failed: result.failed || 0,
      };
    } finally {
      this.cleanup();
    }
  }

  static cancel(): void {
    console.log("[UnifiedScan] Cancelling current operation...");
    this.abortController?.abort();
    MetadataEnricher.stop?.();
    this.cleanup();
  }

  static getStatus() {
    return {
      isRunning: this.isRunning,
      mode: this.currentMode,
      isAutoScanning: useLibraryStore.getState().isAutoScanning,
      isManualScanning: useLibraryStore.getState().isManualScanning,
      isEnriching: useLibraryStore.getState().isEnriching,
    };
  }

  private static cleanup(): void {
    this.isRunning = false;
    this.currentMode = null;
    this.abortController = null;
  }

  private static async startBackgroundEnrichment(): Promise<void> {
    try {
      await MetadataEnricher.startBackgroundWorker((processed, remaining) => {
        const store = useLibraryStore.getState();
        store.setEnrichmentQueueSize(remaining);
      });
    } catch (err) {
      console.error("[UnifiedScan] Background enrichment failed:", err);
    }
  }

  private static async setupNotificationChannel(): Promise<void> {
    if (Platform.OS !== "android") return;
    try {
      await Notifications.setNotificationChannelAsync("media-scanner", {
        name: "Media Scanner",
        importance: Notifications.AndroidImportance.LOW,
        sound: undefined,
        vibrationPattern: undefined,
        enableVibrate: false,
      });
    } catch (error) {
      console.warn("[UnifiedScan] Failed to setup notification channel:", error);
    }
  }

  private static async showScanNotification(
    body: string,
    current: number,
    total: number,
  ): Promise<void> {
    if (Platform.OS !== "android") return;
    try {
      const progress = total > 0 ? Math.round((current / total) * 100) : 0;
      await Notifications.scheduleNotificationAsync({
        identifier: "auto-scan",
        content: {
          title: "Pristine Audio",
          body: `${body} (${progress}%)`,
          sticky: true,
          priority: Notifications.AndroidNotificationPriority.LOW,
        },
        trigger: null,
      });
    } catch {
      // Silent fail
    }
  }

  private static emptyResult(): ScanResult {
    return {
      mode: "quick",
      level: 1,
      discovered: 0,
      added: 0,
      removed: 0,
      updated: 0,
      enrichmentQueued: 0,
      duration: 0,
      errors: [],
    };
  }
}
 