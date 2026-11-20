// src/features/crossfade/crossfade.ts
//
// Logika MURNI crossfade (tanpa import native / AsyncStorage) —
// supaya bisa diuji Jest node tanpa mock modul native, mengikuti
// pola replaygain.ts (logika murni) vs replayGainStore.ts (state).
//
// SEMANTIK (2026-11-20, diverifikasi ke kode — lihat docs/
// CROSSFADE_GAPLESS_VERIFICATION_2026-11-20.md):
// - Nilai = durasi FADE-OUT ekor lagu pada auto-advance (EOF),
//   detik, 0..12. 0 = MATI = perilaku lama (fade-out 500 ms /
//   fade-in 300 ms di mode processing, 10 ms anti-klik di
//   bit-perfect).
// - Fade-in lagu baru TETAP 300 ms / 10 ms; next/prev manual,
//   resume, dan seek tidak kena fade panjang.
// - Bit-perfect MENGABAIKAN setting ini (fade tetap 10 ms).
// - Ini transisi fade BERURUTAN, bukan overlap dua decoder —
//   satu decoder, satu antrean PCM; celah muat (load latency)
//   antar lagu tetap ada, hanya ekornya yang memudar dulu.

/** Batas atas setting crossfade (detik) — sama dengan clamp native. */
export const CROSSFADE_MAX_SECONDS = 12;

/** Batas bawah setting crossfade (detik) — 0 = mati. */
export const CROSSFADE_MIN_SECONDS = 0;

/** Langkah slider di Settings (detik). */
export const CROSSFADE_STEP_SECONDS = 0.5;

/** Clamp nilai mentah (mis. dari state lama / input) ke 0..12. */
export function clampCrossfadeSeconds(value: number): number {
  if (!Number.isFinite(value)) return CROSSFADE_MIN_SECONDS;
  return Math.min(
    CROSSFADE_MAX_SECONDS,
    Math.max(CROSSFADE_MIN_SECONDS, value),
  );
}

/** Label untuk Settings: 0 -> "Mati", 5 -> "5 dtk", 2.5 -> "2,5 dtk". */
export function formatCrossfadeLabel(seconds: number): string {
  const clamped = clampCrossfadeSeconds(seconds);
  if (clamped === 0) return "Mati";
  const text = Number.isInteger(clamped)
    ? String(clamped)
    : clamped.toFixed(1).replace(".", ",");
  return `${text} dtk`;
}
