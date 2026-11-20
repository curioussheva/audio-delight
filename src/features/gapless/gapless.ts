// src/features/gapless/gapless.ts
//
// Logika MURNI gapless (tanpa import native / AsyncStorage) — supaya
// bisa diuji Jest node tanpa mock modul native, mengikuti pola
// crossfade.ts (logika murni) vs crossfadeStore.ts (state).
//
// SEMANTIK (2026-11-20, implementasi — lihat docs/
// CROSSFADE_GAPLESS_VERIFICATION_2026-11-20.md + laporan
// gapless-implementation-report.md):
// - ON = pre-roll track berikutnya saat ekor tinggal ~2 dtk + trim
//   priming/padding encoder (MP3 Xing/LAME, MP4 iTunSMPB) + kurva
//   seam anti-klik 10 ms. OFF = perilaku lama (jeda load antar lagu
//   + fade-out 500 ms / fade-in 300 ms di mode processing).
// - Default ON: gapless adalah perilaku yang diharapkan dari player
//   audiophile — album live / lagu bersambung tidak boleh terdengar
//   terpotong. User bisa mematikan kapan saja dari Settings.
// - Crossfade > 0 MENANG atas gapless untuk transisi itu: pre-roll
//   tidak dimulai dan fade-out ekor = durasi crossfade. Jadi
//   menyalakan crossfade otomatis menonaktifkan gapless di transisi
//   itu (tanpa mengubah toggle gapless).
// - FLAC/WAV/OGG sample-accurate (tanpa trim); MP3/AAC membawa
//   priming (trim). Trim berlaku per-file saat setting ON —
//   independen dari pre-roll.

/** Default setting gapless: ON (perilaku yang diharapkan player audiophile). */
export const GAPLESS_DEFAULT_ENABLED = true;

/** Kunci persist zustand (lihat gaplessStore.ts). */
export const GAPLESS_STORAGE_KEY = "gapless-storage";

/**
 * Deskripsi Settings untuk toggle gapless — berubah bila crossfade
 * aktif (crossfade menang untuk transisi itu).
 */
export function gaplessDescription(
  enabled: boolean,
  crossfadeSeconds: number,
): string {
  if (!enabled) {
    return "Mati — perilaku lama: ada jeda muat antar lagu + ekor memudar 0,5 dtk.";
  }
  if (crossfadeSeconds > 0) {
    return "Hidup, tapi crossfade aktif — crossfade menang untuk transisi ini, gapless tidak berjalan sampai crossfade dimatikan.";
  }
  return "Hidup — lagu bersambung tanpa jeda: track berikutnya sudah siap sebelum lagu ini habis, priming MP3 dipangkas.";
}
