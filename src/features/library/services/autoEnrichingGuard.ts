/**
 * autoEnrichingGuard.ts — gerbang Auto Enriching (toggle, default OFF sejak 2026-11-20).
 *
 * Fungsi murni (diuji jest), mengikuti pola `initialScanGuard` /
 * `refreshPolicy`: keputusan "boleh start OTOMATIS worker enrichment?"
 * tinggal di sini, bukan tersebar di pemanggil.
 *
 * Aturannya — SATU saja, sengaja:
 * - start OTOMATIS worker (`handleResumeDiffResult` pasca initial/resume
 *   scan, `BackgroundScanTask`, `autoScan`) hanya bila toggle Auto
 *   Enriching ON.
 * - aksi EKSPLISIT user TIDAK melewati gerbang ini: modal enrichment
 *   manual (enrichBatch), Rescan Library (manualScan), dan menyalakan
 *   toggle ON di Settings — user yang meminta pekerjaan itu, jadi
 *   worker jalan walau toggle sempat OFF.
 *
 * Kenapa gerbang ini ada: worker enrichment adalah jalur TERPISAH dari
 * Auto Discovery (log HP 2026-11-18: 289 item × 350ms, [JSLag] sampai
 * 4200ms, playSong 5567ms — padahal Auto Discovery OFF). Toggle Auto
 * Discovery hanya menggerbang deteksi (quickDiff + background task);
 * sebelum gerbang ini, worker tidak memeriksa setting apa pun.
 */
export type AutoEnrichingState = {
  isAutoEnrichingEnabled: boolean;
};

export function shouldAutoStartEnrichmentWorker(
  state: AutoEnrichingState,
): boolean {
  return state.isAutoEnrichingEnabled;
}
