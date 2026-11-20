/**
 * resumeEnrichment.ts — S2: pasca resume quickDiff.
 *
 * Sebelum S2, jalur resume hanya memanggil `MetadataEnricher.queueSongs`
 * — lagu baru TERANTRE di AsyncStorage tapi worker tidak pernah dijalankan
 * dari jalur live. Satu-satunya pemanggil live `startBackgroundWorker`
 * adalah BackgroundScanTask, yang meng-unregister diri saat auto-scan OFF
 * (default). Akibat: antrean enrichment tidak pernah diproses kecuali
 * user membuka modal enrichment manual.
 *
 * Fungsi ini menutup rantai itu: antre lagu baru, lalu JALANKAN worker.
 * Worker dipanggil di luar blok perubahan karena antrean persisten bisa
 * berisi sisa dari sesi sebelumnya (app ditutup saat worker masih
 * menguras); worker keluar sendiri bila antrean kosong (guard `isRunning`
 * + `shift()` null), jadi panggilan ini murah saat tidak ada yang
 * dikerjakan.
 *
 * Fire-and-forget: worker menguras antrean dengan jeda 350 ms/item dan
 * tidak boleh menahan `isQuickDiffRunning` di pemanggil — karena itu
 * promise-nya tidak di-await, hanya ditangkap `.catch` supaya kegagalan
 * tidak jadi unhandled rejection.
 *
 * Auto Enriching (2026-11-18): start OTOMATIS worker di sini digerbang
 * toggle Auto Enriching (default OFF sejak 2026-11-20) — lihat autoEnrichingGuard.ts.
 * OFF = lagu baru tetap diantre (persisten), worker tidak di-start;
 * antrean terkuras lewat aksi eksplisit (modal manual / Rescan Library /
 * toggle ON di Settings). Worker yang di-start di sini juga jeda saat
 * lagu diputar (predikat dari playerStore).
 */
import { MetadataEnricher } from "./MetadataEnricher";
import { useLibraryStore } from "../store/libraryStore";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { shouldAutoStartEnrichmentWorker } from "./autoEnrichingGuard";
import type { QuickDiffResult } from "./ScanDiffEngine";

export async function handleResumeDiffResult(
  diffResult: QuickDiffResult,
): Promise<void> {
  const store = useLibraryStore.getState();

  if (diffResult.newCount > 0 || diffResult.deletedCount > 0) {
    console.log(
      `[useScanManager] Changes detected! New: ${diffResult.newCount}, Deleted: ${diffResult.deletedCount}`,
    );

    // N15: JANGAN panggil finishAutoScan di sini — resume quickDiff
    // BUKAN auto-scan: tidak ada auto-scan yang berjalan untuk
    // dimatikan, dan lastScanAt ("terakhir dipindai") jadi menyesatkan.
    // finishAutoScan hanya milik jalur auto-scan yang memulainya
    // (initial scan: useScanManager finally; autoScan: pemanggilnya).
    if (diffResult.newSongs?.length > 0) {
      await MetadataEnricher.queueSongs(
        diffResult.newSongs.map((s) => ({ id: s.id, uri: s.uri })),
      );
    }
  } else {
    console.log("[useScanManager] No changes detected");
  }

  // S2: jalankan worker enrichment — antrean benar-benar diproses.
  // Auto Enriching: start OTOMATIS hanya bila toggle ON. OFF = antrean
  // tetap tersimpan (persisten) untuk aksi manual berikutnya.
  if (
    shouldAutoStartEnrichmentWorker({
      isAutoEnrichingEnabled: store.isAutoEnrichingEnabled,
    })
  ) {
    void MetadataEnricher.startBackgroundWorker(undefined, {
      isPlaying: () => usePlayerStore.getState().isPlaying,
    }).catch((err) =>
      console.warn("[resumeEnrichment] Background worker failed:", err),
    );
  } else {
    console.log(
      "[resumeEnrichment] Auto Enriching OFF — worker tidak di-start, antrean menunggu aksi manual",
    );
  }
}
