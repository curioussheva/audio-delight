/**
 * initialScanGuard.ts — S1: penjaga scan perdana fresh install.
 *
 * Fungsi murni (diuji jest): kapan initial quickscan boleh jalan.
 * Aturannya:
 * - hanya bila user mengizinkan Pindai Awal (toggle
 *   `isInitialScanEnabled` — scan-split; default ON);
 * - hanya bila library kosong (trackCount 0);
 * - hanya bila scan perdana belum pernah selesai — flag persist
 *   `hasCompletedInitialScan` mencegah scan ulang tiap mount/launch
 *   (termasuk saat device memang tidak punya lagu);
 * - tidak bila scan lain sedang jalan (manual/auto) — scan yang sedang
 *   jalan sudah mengisi library, jadi initial scan tidak perlu berebut.
 */
export type InitialScanState = {
  trackCount: number;
  hasCompletedInitialScan: boolean;
  isManualScanning: boolean;
  isAutoScanning: boolean;
  // Scan-split: gerbang Pindai Awal. Pemanggil (useScanManager) membaca
  // dari store; guard ini yang memutuskan — satu tempat, bisa diuji.
  isInitialScanEnabled: boolean;
};

export function shouldRunInitialScan(state: InitialScanState): boolean {
  if (!state.isInitialScanEnabled) return false;
  if (state.hasCompletedInitialScan) return false;
  if (state.trackCount > 0) return false;
  if (state.isManualScanning || state.isAutoScanning) return false;
  return true;
}
