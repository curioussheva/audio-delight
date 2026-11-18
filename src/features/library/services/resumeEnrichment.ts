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
 */
import { MetadataEnricher } from "./MetadataEnricher";
import { useLibraryStore } from "../store/libraryStore";
import type { QuickDiffResult } from "./ScanDiffEngine";

export async function handleResumeDiffResult(
  diffResult: QuickDiffResult,
): Promise<void> {
  const store = useLibraryStore.getState();

  if (diffResult.newCount > 0 || diffResult.deletedCount > 0) {
    console.log(
      `[useScanManager] Changes detected! New: ${diffResult.newCount}, Deleted: ${diffResult.deletedCount}`,
    );

    store.finishAutoScan?.();

    if (diffResult.newSongs?.length > 0) {
      await MetadataEnricher.queueSongs(
        diffResult.newSongs.map((s) => ({ id: s.id, uri: s.uri })),
      );
    }
  } else {
    console.log("[useScanManager] No changes detected");
  }

  // S2: jalankan worker enrichment — antrean benar-benar diproses.
  void MetadataEnricher.startBackgroundWorker().catch((err) =>
    console.warn("[resumeEnrichment] Background worker failed:", err),
  );
}
