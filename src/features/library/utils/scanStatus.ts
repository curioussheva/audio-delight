/**
 * Visibilitas chip status scan — satu sumber kebenaran untuk ScanStatusBar
 * (isi chip) dan TabsLayout (posisi wrapper di atas pill FloatingPlayer).
 *
 * Sama persis dengan 3 cabang progres ScanStatusBar: auto scan selalu
 * tampil; enriching manual tampil bila ada progress; background enrichment
 * tampil bila antrean > 0. Cabang toast "N songs ready for metadata
 * enhancement" tetap mati (keputusan csheva 2026-11-18) — tidak ada di sini.
 */
export interface ScanProgress {
  current: number;
  total: number;
}

export interface ScanStatusState {
  isAutoScanning: boolean;
  isEnriching: boolean;
  enrichmentProgress: (ScanProgress & { currentSong?: string }) | null | undefined;
  isBackgroundEnriching: boolean;
  enrichmentQueueSize: number;
}

export function isScanStatusVisible(state: ScanStatusState): boolean {
  return (
    state.isAutoScanning ||
    (state.isEnriching && state.enrichmentProgress != null) ||
    (state.isBackgroundEnriching && state.enrichmentQueueSize > 0)
  );
}
