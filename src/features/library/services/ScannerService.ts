/**
 * ScannerService
 * Unified scan interface untuk Pristine Audio
 *
 * CHANGELOG:
 * - Refactored untuk menggunakan UnifiedScanService sebagai core
 * - Maintained backward compatibility dengan existing methods
 * - Added new methods untuk enrichment workflow
 * - Deprecated direct scan methods, sekarang proxy ke UnifiedScanService
 */

import * as Notifications from "expo-notifications";
const Platform = require("react-native").Platform;
import { useLibraryStore } from "../store/libraryStore";
import { UnifiedScanService } from "./UnifiedScanService";
import { MetadataEnricher } from "./MetadataEnricher";
import { ScanQueue } from "./ScanQueue";
import { LibraryScanner, ScanProgress } from "@/features/library/api/scanner";
import { ScanPhase } from "../types/scan";

// Legacy flags (maintained untuk compatibility)
let isScanning = false;
let shouldCancel = false;

export class ScannerService {
  // ═══════════════════════════════════════════════════════════════
  // LEGACY METHODS (Backward Compatibility)
  // ═══════════════════════════════════════════════════════════════

  /**
   * @deprecated Gunakan UnifiedScanService.manualScan() untuk kontrol lebih baik
   * FULL SCAN - maintained untuk backward compatibility
   */

  static async fullScan(options?: {
    onProgress?: (progress: ScanProgress) => void;
    onComplete?: (result: any) => void;
  }): Promise<void> {
    console.warn(
      "[ScannerService] fullScan() is deprecated. Use UnifiedScanService.manualScan()",
    );

    if (isScanning) {
      console.warn("[ScannerService] Scan already in progress");
      return;
    }

    isScanning = true;
    shouldCancel = false;

    try {
      const result = await UnifiedScanService.manualScan((progress) => {
        // Map ScanProgress ke format lama jika perlu
        options?.onProgress?.({
          phase: "scanning", // atau 'saving' / 'complete', sesuaikan dengan logic-nya
          current: progress.current,
          total: progress.total,
        });
      });

      options?.onComplete?.(result);
      await this.showCompleteNotification(result.added, 0);
    } catch (error: any) {
      if (error.message === "CANCELLED") {
        await this.showCancelledNotification();
      } else {
        console.error("[ScannerService] Scan error:", error);
        await this.showErrorNotification(error.message);
      }
    } finally {
      isScanning = false;
    }
  }

  /**
   * @deprecated Gunakan UnifiedScanService.autoScan() untuk auto-scan behavior
   * INCREMENTAL SCAN - maintained untuk backward compatibility
   */
  static async incrementalScan(options?: {
    onProgress?: (progress: ScanProgress) => void;
    onComplete?: (result: any) => void;
  }): Promise<void> {
    console.warn(
      "[ScannerService] incrementalScan() is deprecated. Use UnifiedScanService.autoScan()",
    );

    if (isScanning) {
      console.warn("[ScannerService] Scan already in progress");
      return;
    }

    try {
      const result = await UnifiedScanService.autoScan();
      options?.onComplete?.(result);
    } catch (error) {
      console.error("[ScannerService] Incremental scan error:", error);
    }
  }

  /**
   * @deprecated Gunakan UnifiedScanService.enrichMetadata() dengan options
   * RESCAN untuk enrichment - maintained untuk backward compatibility
   */
  static async rescanForEnrichment(options?: {
    onProgress?: (current: number, total: number) => void;
    onComplete?: () => void;
  }): Promise<void> {
    console.warn(
      "[ScannerService] rescanForEnrichment() is deprecated. Use UnifiedScanService.enrichMetadata()",
    );

    if (isScanning) return;
    isScanning = true;

    try {
      const store = useLibraryStore.getState();
      const unenriched = store.getUnenrichedSongs?.() || [];

      await UnifiedScanService.enrichMetadata({
        songIds: unenriched.map((s: any) => s.id).slice(0, 1000),
        onProgress: (current, total) => {
          options?.onProgress?.(current, total);
        },
      });

      options?.onComplete?.();
      await this.showCompleteNotification(unenriched.length, 0);
    } catch (error) {
      console.error("[ScannerService] Enrichment rescan failed:", error);
    } finally {
      isScanning = false;
    }
  }

  /**
   * @deprecated Gunakan UnifiedScanService.manualScan() dengan folder filter
   * SCAN SINGLE FOLDER - maintained untuk backward compatibility
   */
  static async scanFolder(
    folderPath: string,
    options?: {
      onProgress?: (current: number, total: number) => void;
      onComplete?: () => void;
    },
  ): Promise<void> {
    console.warn(
      "[ScannerService] scanFolder() is deprecated. Use UnifiedScanService.manualScan()",
    );

    if (isScanning) return;
    isScanning = true;

    try {
      // Untuk saat ini, jalankan full scan (folder filtering bisa ditambahkan ke UnifiedScanService)
      await this.fullScan({
        onProgress: (progress) => {
          options?.onProgress?.(progress.current, progress.total);
        },
        onComplete: () => {
          options?.onComplete?.();
        },
      });
    } finally {
      isScanning = false;
    }
  }

  /**
   * CANCEL current scan - maintained untuk backward compatibility
   * Sekarang proxy ke UnifiedScanService.cancel()
   */
  static cancelScan(): void {
    console.log("[ScannerService] Cancelling scan...");
    shouldCancel = true;
    isScanning = false;

    UnifiedScanService.cancel();
    Notifications.dismissAllNotificationsAsync().catch(() => {});
  }

  /**
   * GET scan status - maintained untuk backward compatibility
   */
  /**
   * GET scan status - maintained untuk backward compatibility
   */
  static isScanningActive(): boolean {
    const store = useLibraryStore.getState();
    return (
      store.isAutoScanning ||
      store.isManualScanning ||
      store.isEnriching ||
      false // fallback jika UnifiedScanService belum punya getStatus
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // NEW RECOMMENDED METHODS (Proxy ke UnifiedScanService)
  // ═══════════════════════════════════════════════════════════════

  /**
   * 🔥 AUTO SCAN - Quick background scan
   * Recommended untuk app startup / library screen mount
   */
  static async quickScan(): Promise<{
    added: number;
    removed: number;
    queued: number;
  }> {
    const result = await UnifiedScanService.autoScan();
    return {
      added: result.added,
      removed: result.removed,
      queued: result.enrichmentQueued,
    };
  }

  /**
   * 👤 FULL SCAN - User initiated dengan progress
   * Recommended untuk manual rescan
   */
  static async fullRescan(
    onProgress?: (
      phase: "discover" | "process",
      current: number,
      total: number,
      message?: string,
    ) => void,
  ): Promise<{
    discovered: number;
    added: number;
    removed: number;
    updated: number;
    duration: number;
  }> {
    const result = await UnifiedScanService.manualScan((progress) => {
      onProgress?.(
        progress.phase as "discover" | "process",
        progress.current,
        progress.total,
        progress.message,
      );
    });

    return {
      discovered: result.discovered,
      added: result.added,
      removed: result.removed,
      updated: result.updated,
      duration: result.duration,
    };
  }

  /**
   * ✨ ENRICH METADATA - Batch metadata enhancement
   * Recommended untuk "Enhance Metadata" menu
   */
  static async enhanceMetadata(options?: {
    limit?: number;
    onProgress?: (
      current: number,
      total: number,
      songInfo?: { title?: string; artist?: string },
    ) => void;
  }): Promise<{
    processed: number;
    success: number;
    failed: number;
  }> {
    return UnifiedScanService.enrichMetadata({
      limit: options?.limit,
      onProgress: options?.onProgress,
    });
  }

  /**
   * 🎵 ENRICH SPECIFIC SONGS
   * Recommended untuk enhance lagu tertentu (e.g., yang sedang diputar)
   */
  static async enrichSongs(songIds: string[]): Promise<{
    success: number;
    failed: number;
  }> {
    const result = await UnifiedScanService.enrichMetadata({
      songIds,
    });

    return {
      success: result.success,
      failed: result.failed,
    };
  }

  /**
   * 📊 GET ENRICHMENT STATUS
   */
  static async getEnrichmentStatus(): Promise<{
    queueSize: number;
    unenrichedCount: number;
    isProcessing: boolean;
  }> {
    const store = useLibraryStore.getState();
    const queueSize = await ScanQueue.getSize();

    return {
      queueSize,
      unenrichedCount: store.unenrichedCount || 0,
      isProcessing: useLibraryStore.getState().isEnriching,
    };
  }

  /**
   * 🧹 CLEAR ENRICHMENT QUEUE
   */
  static async clearEnrichmentQueue(): Promise<void> {
    await ScanQueue.clear();
    const store = useLibraryStore.getState();
    store.setEnrichmentQueueSize?.(0);
  }

  // ═══════════════════════════════════════════════════════════════
  // PRIVATE METHODS (Notification helpers - maintained)
  // ═══════════════════════════════════════════════════════════════

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
      console.warn(
        "[ScannerService] Failed to setup notification channel:",
        error,
      );
    }
  }

  private static async showCompleteNotification(
    total: number,
    errors: number,
  ): Promise<void> {
    if (Platform.OS !== "android") return;

    try {
      await Notifications.dismissNotificationAsync("scanning-notif");

      let body = `${total} lagu berhasil diproses.`;
      if (errors > 0) body += ` (${errors} error)`;

      await Notifications.scheduleNotificationAsync({
        identifier: "scan-complete",
        content: {
          title: "Scan Selesai",
          body,
          priority: Notifications.AndroidNotificationPriority.DEFAULT,
        },
        trigger: null,
      });
    } catch (error) {
      console.warn(
        "[ScannerService] Failed to show complete notification:",
        error,
      );
    }
  }

  private static async showCancelledNotification(): Promise<void> {
    if (Platform.OS !== "android") return;

    try {
      await Notifications.dismissNotificationAsync("scanning-notif");
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Scan Dibatalkan",
          body: "Proses scan library dibatalkan oleh pengguna.",
        },
        trigger: null,
      });
    } catch (error) {
      console.warn(
        "[ScannerService] Failed to show cancelled notification:",
        error,
      );
    }
  }

  private static async showErrorNotification(message: string): Promise<void> {
    if (Platform.OS !== "android") return;

    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Scan Gagal",
          body: message.length > 100 ? message.substring(0, 100) : message,
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: null,
      });
    } catch (error) {
      console.warn(
        "[ScannerService] Failed to show error notification:",
        error,
      );
    }
  }
}

// Default export maintained untuk compatibility
export default ScannerService;
