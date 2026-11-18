/**
 * initialScan.ts — S1 + fix S2-enqueue.
 *
 * Efek initial scan di useScanManager dulunya memanggil
 * `ScanDiffEngine.quickDiff` lalu langsung `setTracks` — hasil diff
 * tidak pernah diteruskan ke rantai pasca-diff, jadi 287 lagu fresh
 * install tidak pernah masuk `ScanQueue`: worker menguras antrean
 * kosong dan "finished" dengan 0 diproses, sementara `unenrichedCount`
 * tetap 287 (lihat S2-worker-investigation.md).
 *
 * Fungsi ini menjalankan satu rantai lengkap yang sama dengan resume
 * quickDiff: quickDiff → setInitialScanCompleted → setTracks →
 * handleResumeDiffResult (queueSongs bila ada lagu baru + jalankan
 * worker enrichment). Dipisah dari efek supaya rantai ini bisa diuji
 * tanpa me-render hook — repo ini tidak punya testing-library dan
 * jest hanya menjalankan `.test.ts`.
 */
import { ScanDiffEngine } from "./ScanDiffEngine";
import { LibraryScanner } from "../api/scanner";
import { handleResumeDiffResult } from "./resumeEnrichment";

/**
 * Potongan store yang dipakai initial scan. Metode (bukan properti
 * fungsi) supaya bivarian — store penuh (`setTracks: MediaTrack[]`)
 * tetap bisa dipakai di sini.
 */
export interface InitialScanStore {
  startAutoScan(): void;
  setInitialScanCompleted(): void;
  setTracks(tracks: unknown[]): void;
}

export async function runInitialScan(store: InitialScanStore): Promise<void> {
  store.startAutoScan();
  const diffResult = await ScanDiffEngine.quickDiff(undefined, {
    bypassAutoScanGate: true,
  });
  store.setInitialScanCompleted();
  // quickDiff menulis DB saja — cerminkan ke store supaya daftar
  // di UI langsung terisi tanpa menunggu foreground refresh.
  // N3: getLibrarySongs kini melempar saat query gagal (bukan [] lagi).
  // Galat sesaat di sini tidak boleh mengosongkan daftar (jangan
  // setTracks) dan tidak boleh menggagalkan rantai pasca-diff — lewati
  // setTracks, lagu baru tetap diantre + worker tetap jalan di bawah.
  try {
    const freshSongs = await LibraryScanner.getLibrarySongs();
    store.setTracks(freshSongs);
  } catch (error) {
    console.warn("[initialScan] getLibrarySongs gagal, daftar lama dipertahankan:", error);
  }
  // S2-enqueue fix: teruskan hasil diff ke rantai pasca-diff yang
  // sama dengan resume quickDiff — antre lagu baru + jalankan worker.
  // Tanpa ini, lagu hasil quickscan awal tidak pernah masuk antrean
  // dan enrichment tidak pernah jalan dari fresh install.
  await handleResumeDiffResult(diffResult);
}
