/**
 * initialScanGuard.ts — S1: penjaga scan perdana fresh install.
 *
 * Fungsi murni (diuji jest): kapan initial quickscan boleh jalan.
 * Initial scan TIDAK punya toggle — jalan secara default saat fresh
 * install (keputusan csheva 2026-11-18: toggle "Pindai Awal" dihapus
 * dari Settings karena berbahasa implementasi; user belum paham cara
 * kerja app). Aturannya:
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
};

export function shouldRunInitialScan(state: InitialScanState): boolean {
  if (state.hasCompletedInitialScan) return false;
  if (state.trackCount > 0) return false;
  if (state.isManualScanning || state.isAutoScanning) return false;
  return true;
}
