/**
 * Status pemutaran untuk ditampilkan di layar Player — logika murni
 * (tanpa React/native) supaya bisa diuji. Dipakai indikator sleep timer
 * (A4) dan chip speed/tuning (P2).
 */
import { A432_CENTS, centsToFrequency } from "./tuning";

/** Sisa sleep timer dalam menit (dibulatkan ke atas). null bila timer mati. */
export function sleepRemainingMinutes(
  sleepTimerEnd: number | null,
  nowMs: number,
): number | null {
  if (sleepTimerEnd === null) return null;
  return Math.max(0, Math.ceil((sleepTimerEnd - nowMs) / 60000));
}

/**
 * Chip kecepatan putar — null bila 1.0× (default, tidak perlu ditampilkan).
 * Format mengikuti Settings ("1.00×").
 */
export function formatSpeedChip(speed: number): string | null {
  if (Math.abs(speed - 1) < 0.001) return null;
  return `${speed.toFixed(2)}×`;
}

/**
 * Chip tuning — null bila 0 sen (A=440 default). Preset Verdi tampil
 * "A=432"; nilai lain tampil frekuensi A-nya (format TuningControl).
 */
export function formatTuningChip(cents: number): string | null {
  if (Math.abs(cents) < 0.5) return null;
  if (Math.abs(cents - A432_CENTS) < 0.5) return "A=432";
  return `A=${centsToFrequency(cents).toFixed(1)} Hz`;
}
