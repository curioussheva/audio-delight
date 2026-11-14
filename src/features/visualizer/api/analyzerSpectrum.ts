// src/features/visualizer/api/analyzerSpectrum.ts
//
// Matematika murni untuk spektrum analyzer ala Neutron di tab Analyzer.
// Dipisah dari komponen supaya bisa diuji tanpa React Native.
//
// Model data (harus sama dengan Kotlin NativeVisualizerBridge):
// - getFFTData() mengembalikan OUTPUT_BINS = 128 nilai 0..1, log-scaled.
// - Tiap bin b mencakup pita frekuensi logaritmik:
//     [20 * (nyquist/20)^(b/128), 20 * (nyquist/20)^((b+1)/128)] Hz
//   dengan nyquist = laju stream aktual / 2 (Kotlin membaca
//   EngineManager.actualSampleRate() per frame; TS menerima laju yang sama
//   lewat prop sampleRate — default 48 kHz -> nyquist 24 kHz).
// - Nilai ternormalisasi v memetakan ke dB lewat:
//     dB = DB_FLOOR + v * (DB_CEIL - DB_FLOOR), DB_FLOOR = -80, DB_CEIL = 0
//   (full scale sejak 2026-11-14; DULU ceil -10 sehingga bar terpotong).

export const ANALYZER_BIN_COUNT = 128;
export const ANALYZER_FREQ_MIN = 20;
/** Nyquist default (stream 48 kHz). Untuk laju lain, oper freqMax eksplisit. */
export const ANALYZER_FREQ_MAX = 24000;
export const ANALYZER_DB_FLOOR = -80;
export const ANALYZER_DB_CEIL = 0;

/** Label sumbu frekuensi (Hz) yang digambar di bawah spektrum. */
export const ANALYZER_FREQ_LABELS = [
  20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000,
];

/** Garis grid dB (dB) yang digambar melintang spektrum. */
export const ANALYZER_DB_GRID = [0, -20, -40, -60, -80];

/**
 * Ambang warna bar (dB) — supaya user paham kapan audio menyentuh clip:
 * hijau di bawah WARN_DB, kuning WARN_DB..CLIP_WARN_DB, merah >= CLIP_WARN_DB.
 * CLIP_DB = ambang latch pill CLIP + peak hold merah (>= -1 dB).
 */
export const ANALYZER_WARN_DB = -12;
export const CLIP_WARN_DB = -3;
export const CLIP_DB = -1;

export const ANALYZER_COLOR_LOW = "#22C55E";
export const ANALYZER_COLOR_WARN = "#EAB308";
export const ANALYZER_COLOR_CLIP = "#EF4444";

export type AnalyzerDbZone = "low" | "warn" | "clip";

/** Zona warna untuk satu nilai dB. */
export function dbZone(db: number): AnalyzerDbZone {
  "worklet"; // dipanggil dari barsPath (useDerivedValue, UI thread)
  if (db >= CLIP_WARN_DB) return "clip";
  if (db >= ANALYZER_WARN_DB) return "warn";
  return "low";
}

/** Warna bar untuk satu nilai dB. */
export function dbColor(db: number): string {
  "worklet"; // dipanggil dari barsPath (useDerivedValue, UI thread)
  const zone = dbZone(db);
  if (zone === "clip") return ANALYZER_COLOR_CLIP;
  if (zone === "warn") return ANALYZER_COLOR_WARN;
  return ANALYZER_COLOR_LOW;
}

/**
 * Label frekuensi yang ditampilkan untuk satu freqMax: label kanonik yang
 * <= freqMax, ditambah freqMax sendiri sebagai label ujung bila belum ada.
 */
export function freqLabelsFor(freqMax: number): number[] {
  const labels = ANALYZER_FREQ_LABELS.filter((f) => f <= freqMax);
  if (labels[labels.length - 1] !== freqMax) labels.push(freqMax);
  return labels;
}

/** Frekuensi tengah (Hz) bin ke-`bin` dari `bins` bin logaritmik. */
export function binCenterFreq(
  bin: number,
  bins: number = ANALYZER_BIN_COUNT,
  freqMax: number = ANALYZER_FREQ_MAX,
): number {
  const t = (bin + 0.5) / bins;
  return ANALYZER_FREQ_MIN * Math.pow(freqMax / ANALYZER_FREQ_MIN, t);
}

/** Posisi fraksional (0..1) sebuah frekuensi pada sumbu log 20 Hz–freqMax. */
export function freqToFraction(
  freqHz: number,
  freqMax: number = ANALYZER_FREQ_MAX,
): number {
  "worklet"; // dipanggil dari gridPath (useDerivedValue, UI thread)
  const t =
    Math.log(freqHz / ANALYZER_FREQ_MIN) /
    Math.log(freqMax / ANALYZER_FREQ_MIN);
  return Math.max(0, Math.min(1, t));
}

/** Nilai ternormalisasi 0..1 -> dB. */
export function valueToDb(value: number): number {
  "worklet"; // dipanggil dari barsPath/peakPath (useDerivedValue, UI thread)
  const v = Math.max(0, Math.min(1, value));
  return ANALYZER_DB_FLOOR + v * (ANALYZER_DB_CEIL - ANALYZER_DB_FLOOR);
}

/** dB -> nilai ternormalisasi 0..1. */
export function dbToValue(db: number): number {
  "worklet"; // dipanggil dari gridPath (useDerivedValue, UI thread)
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
