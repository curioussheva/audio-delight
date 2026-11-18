/**
 * src/features/library/services/UnifiedScanService.ts
 */

// ✅ Import ScanDiffEngine sebagai object — quickDiff dan runMediaStoreDiff
//    adalah methods, bukan named exports
import { ScanDiffEngine, ScanAbortedError } from "./ScanDiffEngine";
import { MetadataEnricher } from "./MetadataEnricher";
import { useLibraryStore } from "../store/libraryStore";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { ScanResult, ScanProgress, EnrichmentLevel } from "../types/scan";
import * as Notifications from "expo-notifications";
const Platform = require("react-native").Platform;

export class UnifiedScanService {
  private static isRunning = false;
  private static abortController: AbortController | null = null;
  private static currentMode: "auto" | "manual" | null = null;

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
      // J2-4: sinyal diteruskan (checkpoint sebelum transaction + per 20 lagu).
      const diffResult = await ScanDiffEngine.runMediaStoreDiff(
        (current, total) => {
          onProgress?.({
            phase: "process",
            current,
            total,
            message: `Processing file ${current} of ${total}...`,
          });
        },
        this.abortController.signal,
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

      // Aksi EKSPLISIT (Rescan manual dari Settings/Library) — worker
      // TETAP jalan walau Auto Enriching OFF: user yang meminta
      // pekerjaan itu. Lagu baru diantre (dedupe di ScanQueue) lalu
      // worker di-start; jeda saat putar + throttle tetap berlaku.
      // Ekor enrichment ini best-effort: gagal antre/start tidak boleh
      // menggagalkan hasil scan (lagu sudah masuk DB).
      if (diffResult.newCount > 0 && diffResult.newSongs?.length > 0) {
        try {
          const queued = await MetadataEnricher.queueSongs(
            diffResult.newSongs.map((s) => ({
              id: s.id,
              uri: s.uri,
              priority: 0,
            })),
          );
          result.enrichmentQueued = queued;
          this.startBackgroundEnrichment();
        } catch (enrichErr) {
          console.warn(
            "[UnifiedScan] Manual scan: gagal antre/start enrichment (scan tetap sukses):",
            enrichErr,
          );
        }
      }

      console.log(`✅ [UnifiedScan] Manual scan completed`, result);
      return result;
    } catch (error) {
      if (error instanceof ScanAbortedError) {
        console.log("[UnifiedScan] Manual scan cancelled");
        throw error;
      }
      console.error("[UnifiedScan] Manual scan failed:", error);
      throw error;
    } finally {
      // 🔥 FIX: SELALU reset store state (anti stuck)
      store.finishManualScan();
      console.log("🔚 [UnifiedScan] finally: store.finishManualScan() called");
      
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
    // J2-3: guard yang sama seperti auto/manual — enrichment tidak boleh
    // mulai di tengah scan, dan sebaliknya (isRunning satu lock bersama).
    if (this.isRunning) {
      throw new Error("Scan already in progress. Please wait or cancel.");
    }

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

    console.log(
      `✨ [UnifiedScan] Starting enrichment for ${targetIds.length} songs...`,
    );

    this.isRunning = true;
    this.currentMode = "auto";
    // J2-3: abortController sendiri — cancel() meng-abort ini dan loop
    // enrichBatch berhenti di item berikut (bukan jalan sampai habis).
    this.abortController = new AbortController();

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
        this.abortController.signal,
      );

      store.finishEnrichment();

      const remaining = store.getUnenrichedSongs?.() || [];
      store.setUnenrichedCount(remaining.length);

      // N17: processed = yang BENAR-BENAR diproses (sukses + gagal),
      // bukan total target. Sebelumnya targetIds.length — saat batal,
      // lagu yang di-skip ikut dihitung "processed" dan modal
      // menampilkan angka bohong. skipped = targetIds.length - processed
      // (ada di result enrichBatch, tidak diekspos ke pemanggil).
      return {
        processed: (result.success || 0) + (result.failed || 0),
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
    // J2-4: SENGAJA tidak memanggil cleanup() di sini. isRunning tetap
    // true sampai operasi yang sedang jalan mendeteksi abort di
    // checkpoint-nya (sebelum transaction / per 20 lagu / per item batch)
    // dan keluar lewat finally -> cleanup(). Kalau isRunning direset di
    // sini, scan kedua bisa mulai sementara scan pertama masih menulis DB.
    // Satu-satunya tahap yang tidak bisa dibatalkan adalah query
    // MediaStore bridge itu sendiri; begitu query kembali, checkpoint
    // berikutnya langsung membatalkan.
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
      await MetadataEnricher.startBackgroundWorker(
        (processed, remaining) => {
          const store = useLibraryStore.getState();
          store.setEnrichmentQueueSize(remaining);
        },
        { isPlaying: () => usePlayerStore.getState().isPlaying },
      );
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
      console.warn(
        "[UnifiedScan] Failed to setup notification channel:",
        error,
      );
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
}
