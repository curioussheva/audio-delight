// src/features/visualizer/api/analyzerSpectrum.ts
//
// Matematika murni untuk spektrum analyzer ala Neutron di tab Analyzer.
// Dipisah dari komponen supaya bisa diuji tanpa React Native.
//
// Model data (harus sama dengan Kotlin NativeVisualizerBridge):
// - getFFTData() mengembalikan OUTPUT_BINS = 128 nilai 0..1, log-scaled.
// - Tiap bin b mencakup pita frekuensi logaritmik:
//     [20 * 1000^(b/128), 20 * 1000^((b+1)/128)] Hz
//   (logIndex di Kotlin: freq = 20 * (20000/20)^t, t = b/128).
// - Nilai ternormalisasi v memetakan ke dB lewat:
//     dB = DB_FLOOR + v * (DB_CEIL - DB_FLOOR), DB_FLOOR = -80, DB_CEIL = -10.

export const ANALYZER_BIN_COUNT = 128;
export const ANALYZER_FREQ_MIN = 20;
export const ANALYZER_FREQ_MAX = 20000;
export const ANALYZER_DB_FLOOR = -80;
export const ANALYZER_DB_CEIL = -10;

/** Label sumbu frekuensi (Hz) yang digambar di bawah spektrum. */
export const ANALYZER_FREQ_LABELS = [
  20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000,
];

/** Garis grid dB (dB) yang digambar melintang spektrum. */
export const ANALYZER_DB_GRID = [-10, -20, -40, -60, -80];

/** Frekuensi tengah (Hz) bin ke-`bin` dari `bins` bin logaritmik. */
export function binCenterFreq(bin: number, bins: number = ANALYZER_BIN_COUNT): number {
  const t = (bin + 0.5) / bins;
  return ANALYZER_FREQ_MIN * Math.pow(ANALYZER_FREQ_MAX / ANALYZER_FREQ_MIN, t);
}

/** Posisi fraksional (0..1) sebuah frekuensi pada sumbu log 20 Hz–20 kHz. */
export function freqToFraction(freqHz: number): number {
  const t =
    Math.log(freqHz / ANALYZER_FREQ_MIN) /
    Math.log(ANALYZER_FREQ_MAX / ANALYZER_FREQ_MIN);
  return Math.max(0, Math.min(1, t));
}

/** Nilai ternormalisasi 0..1 -> dB. */
export function valueToDb(value: number): number {
  const v = Math.max(0, Math.min(1, value));
  return ANALYZER_DB_FLOOR + v * (ANALYZER_DB_CEIL - ANALYZER_DB_FLOOR);
}

/** dB -> nilai ternormalisasi 0..1. */
export function dbToValue(db: number): number {
  const v = (db - ANALYZER_DB_FLOOR) / (ANALYZER_DB_CEIL - ANALYZER_DB_FLOOR);
  return Math.max(0, Math.min(1, v));
}

/** Format frekuensi untuk label: "440 Hz", "1.2 kHz", "10 kHz". */
export function formatFreq(hz: number): string {
  if (hz >= 1000) {
    const k = hz / 1000;
    const s = k >= 10 ? String(Math.round(k)) : k.toFixed(1).replace(/\.0$/, "");
    return `${s} kHz`;
  }
  return `${Math.round(hz)} Hz`;
}

/** Indeks bin dengan nilai terbesar, atau -1 bila data kosong/semua nol. */
export function dominantBin(data: readonly number[]): number {
  let best = -1;
  let bestVal = 0;
  for (let i = 0; i < data.length; i++) {
    const v = data[i] ?? 0;
    if (v > bestVal) {
      bestVal = v;
      best = i;
    }
  }
  return best;
}
