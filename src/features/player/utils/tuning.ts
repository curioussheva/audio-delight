/**
 * Matematika tuning (retune) murni — tanpa dependensi React, store, atau
 * native. Dipakai TuningControl (settings + subscreen Solfeggio + tab DSP)
 * dan playerStore (clamp yang sama dengan UI).
 */

// Rentang tuning store: ±100 sen (jangan diubah — native phase vocoder
// diuji dalam rentang ini; lihat setTuningCents di playerStore).
export const TUNING_MIN_CENTS = -100;
export const TUNING_MAX_CENTS = 100;
export const TUNING_STEP_CENTS = 5;

/**
 * Selisih A=432 (Verdi) terhadap A=440 standar, dalam sen.
 * 1200 * log2(432/440) ≈ -31.77 — jangan diubah.
 */
export const A432_CENTS = 1200 * Math.log2(432 / 440);

/** Frekuensi nada A (Hz) untuk offset tuning dalam sen. 0 sen = 440 Hz. */
export function centsToFrequency(cents: number): number {
  return 440 * Math.pow(2, cents / 1200);
}

/** Jepit offset tuning ke rentang ±100 sen. */
export function clampTuningCents(cents: number): number {
  return Math.max(TUNING_MIN_CENTS, Math.min(TUNING_MAX_CENTS, cents));
}
