/**
 * Status pemutaran untuk ditampilkan di layar Player — logika murni
 * (tanpa React/native) supaya bisa diuji. Dipakai indikator sleep timer
 * (A4) dan chip speed/tuning (P2).
 */

/** Sisa sleep timer dalam menit (dibulatkan ke atas). null bila timer mati. */
export function sleepRemainingMinutes(
  sleepTimerEnd: number | null,
  nowMs: number,
): number | null {
  if (sleepTimerEnd === null) return null;
  return Math.max(0, Math.ceil((sleepTimerEnd - nowMs) / 60000));
}
