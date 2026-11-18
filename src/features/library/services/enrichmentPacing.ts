/**
 * enrichmentPacing.ts — throttle worker enrichment (less aggressive).
 *
 * Angka di sini BUKAN angka ajaib — masing-masing punya alasan dan
 * dampak yang terukur (lihat laporan scan-auto-options-report.md):
 *
 * - INTER_ITEM_DELAY_MS = 1000 (dulu 350): jeda idle ANTAR item worker.
 *   Jeda ini waktu luang buat thread JS di antara dua round-trip
 *   bridge/DB. Log HP 2026-11-18: 289 item × 350ms ≈ 100 dtk kerja
 *   nyaris-kontinu dengan [JSLag] sampai 4200ms. Di 1000ms, antrean
 *   yang sama selesai dalam ~5–6 menit (289 × ±1,3 dtk/item incl.
 *   kerja processItem) — lebih lambat, tapi thread JS mendapat satu
 *   detik penuh jeda antar item, jadi lonjakan lag mengecil. Per-item
 *   cost (extract + verifikasi fake Hi-Res + tulis DB) TIDAK berubah
 *   oleh angka ini — hanya penyebarannya.
 * - PLAYBACK_POLL_MS = 2000: interval pengecekan ulang saat worker
 *   menunggu lagu berhenti diputar. 2 dtk cukup responsif (worker
 *   lanjut ≤2 dtk setelah jeda) tanpa polling ketat.
 *
 * `waitWhilePlaying` sengaja murni (predikat + sinyal disuntik) supaya
 * bisa diuji jest dengan fake timer — worker sendiri (`MetadataEnricher`)
 * tidak bisa diuji di jest repo ini (mengimpor modul native).
 */
export const ENRICHMENT_INTER_ITEM_DELAY_MS = 1000;
export const ENRICHMENT_PLAYBACK_POLL_MS = 2000;

/** Jeda minimum antar poll supaya predikat yang salah tidak busy-loop. */
const MIN_POLL_MS = 250;

export async function waitWhilePlaying(
  isPlaying: () => boolean,
  signal?: AbortSignal,
  pollMs: number = ENRICHMENT_PLAYBACK_POLL_MS,
): Promise<void> {
  const interval = Math.max(MIN_POLL_MS, pollMs);
  while (isPlaying()) {
    if (signal?.aborted) return;
    await new Promise((resolve) => setTimeout(resolve, interval));
    if (signal?.aborted) return;
  }
}
