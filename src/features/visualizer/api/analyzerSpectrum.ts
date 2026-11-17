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
/** Batas atas grafik yang masih muat satu layar (tanpa scroll) — 20 kHz,
 *  batas atas pendengaran manusia (keputusan csheva ronde 9, 2026-11-17).
 *  Di atas ini grafik boleh scroll untuk menampilkan konten ultrasonik. */
export const ANALYZER_FIT_MAX_HZ = 20000;
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
 * Skala warna parametrik biru→merah untuk main player
 * (ParametricSpectrumView) — gradasi mengikuti dB.
 *
 * Sejak 2026-11-18 (atas permintaan csheva: "-80 biru sampai 0 dB merah"
 * + sedikit efek): interpolasi KONTINU antar jangkar, bukan zona terpisah.
 * Jangkarnya sama dengan zona lama supaya "keras" dan "clip" dibaca sama
 * seperti Analyzer; yang berubah hanya transisinya: mulus, bukan patah.
 * dB -80 biru, -60 cyan, -40 hijau, -20 kuning, -12 oranye, 0 merah.
 * SINGLE-CHANNEL (mono): warna dihitung dari satu array FFT campuran
 * (getFFTData), BUKAN per-channel L/R — dual-channel butuh FFT native
 * per channel (follow-up, bukan di sini).
 */
export const PARAMETRIC_DB_CYAN = -60;
export const PARAMETRIC_DB_GREEN = -40;
export const PARAMETRIC_DB_YELLOW = -20;
export const PARAMETRIC_DB_ORANGE = -12;
export const PARAMETRIC_DB_RED = -3;

export const PARAMETRIC_COLOR_BLUE = "#2563EB";
export const PARAMETRIC_COLOR_CYAN = "#06B6D4";
export const PARAMETRIC_COLOR_GREEN = ANALYZER_COLOR_LOW;
export const PARAMETRIC_COLOR_YELLOW = ANALYZER_COLOR_WARN;
export const PARAMETRIC_COLOR_ORANGE = "#F97316";
export const PARAMETRIC_COLOR_RED = ANALYZER_COLOR_CLIP;

/** Jangkar gradient parametrik (dB → warna). Dipakai parametricDbColor
 * dan shader LinearGradient di ParametricSpectrumView (posisinya lewat
 * dbToValue). */
export const PARAMETRIC_GRADIENT_STOPS: readonly {
  db: number;
  color: string;
}[] = [
  { db: ANALYZER_DB_FLOOR, color: PARAMETRIC_COLOR_BLUE },
  { db: PARAMETRIC_DB_CYAN, color: PARAMETRIC_COLOR_CYAN },
  { db: PARAMETRIC_DB_GREEN, color: PARAMETRIC_COLOR_GREEN },
  { db: PARAMETRIC_DB_YELLOW, color: PARAMETRIC_COLOR_YELLOW },
  { db: PARAMETRIC_DB_ORANGE, color: PARAMETRIC_COLOR_ORANGE },
  { db: ANALYZER_DB_CEIL, color: PARAMETRIC_COLOR_RED },
];

export type ParametricDbZone =
  | "blue"
  | "cyan"
  | "green"
  | "yellow"
  | "orange"
  | "red";

/** Zona warna parametrik (biru→merah) untuk satu nilai dB. */
export function parametricDbZone(db: number): ParametricDbZone {
  "worklet"; // dipanggil dari barsPath (useDerivedValue, UI thread)
  if (db >= PARAMETRIC_DB_RED) return "red";
  if (db >= PARAMETRIC_DB_ORANGE) return "orange";
  if (db >= PARAMETRIC_DB_YELLOW) return "yellow";
  if (db >= PARAMETRIC_DB_GREEN) return "green";
  if (db >= PARAMETRIC_DB_CYAN) return "cyan";
  return "blue";
}

/** "#RRGGBB" -> [r, g, b] 0..255. Murni, worklet-safe. */
function hexToRgb(hex: string): [number, number, number] {
  "worklet";
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

/** [r, g, b] 0..255 -> "#RRGGBB" (huruf besar). Murni, worklet-safe. */
function rgbToHex(r: number, g: number, b: number): string {
  "worklet";
  const d = "0123456789ABCDEF";
  const h = (n: number) => {
    const v = Math.round(Math.max(0, Math.min(255, n)));
    return d[Math.floor(v / 16)] + d[v % 16];
  };
  return `#${h(r)}${h(g)}${h(b)}`;
}

/**
 * Warna parametrik (biru→merah) untuk satu nilai dB — interpolasi
 * KONTINU (lerp RGB) antar jangkar PARAMETRIC_GRADIENT_STOPS, bukan
 * warna zona yang patah. -80 dB = biru, 0 dB = merah; di luar rentang
 * di-clamp ke ujung. Dipakai test + spesifikasi gradient; gambar bar
 * sendiri memakai shader LinearGradient dengan jangkar yang sama.
 */
export function parametricDbColor(db: number): string {
  "worklet";
  const stops = PARAMETRIC_GRADIENT_STOPS;
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (db <= first.db) return first.color;
  if (db >= last.db) return last.color;
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (db >= a.db && db <= b.db) {
      const t = (db - a.db) / (b.db - a.db);
      const [r1, g1, b1] = hexToRgb(a.color);
      const [r2, g2, b2] = hexToRgb(b.color);
      return rgbToHex(
        r1 + (r2 - r1) * t,
        g1 + (g2 - g1) * t,
        b1 + (b2 - b1) * t,
      );
    }
  }
  return last.color;
}

/**
 * Peak hold (main player): laju jatuh puncak per tick reaksi (~10 Hz,
 * mengikuti poll VisualizerService 100 ms). 0.03/tick ≈ 0.3 amp/detik
 * ≈ 24 dB/detik — puncak turun pelan, ~3 detik dari 0 dB ke lantai.
 */
export const PEAK_HOLD_DECAY = 0.03;
/** Lantai peak hold — sama dengan lantai bar diam (0.05). */
export const PEAK_HOLD_FLOOR = 0.05;

/**
 * Langkah peak hold berikutnya: naik INSTAN ke nilai saat ini, turun
 * pelan (PEAK_HOLD_DECAY) bila nilai saat ini di bawah puncak, tidak
 * pernah di bawah lantai. Murni, bisa diuji jest; dipanggil dari
 * useAnimatedReaction di ParametricSpectrumView (UI thread).
 */
export function nextPeakHold(peak: number, current: number): number {
  "worklet";
  if (current >= peak) return current;
  return Math.max(PEAK_HOLD_FLOOR, peak - PEAK_HOLD_DECAY);
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
  "worklet"; // dipanggil dari AnalyzerSpectrum (useAnimatedReaction, UI thread)
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
  "worklet"; // dipanggil dari AnalyzerSpectrum (useAnimatedReaction, UI thread)
  if (hz >= 1000) {
    const k = hz / 1000;
    const s = k >= 10 ? String(Math.round(k)) : k.toFixed(1).replace(/\.0$/, "");
    return `${s} kHz`;
  }
  return `${Math.round(hz)} Hz`;
}

/**
 * Indeks bin dengan nilai terbesar, atau -1 bila data kosong/semua nol.
 * `upto` (E): batasi pencarian ke bin [0, upto) — frekuensi dominan
 * hanya dihitung dari bin yang tampil di grafik (di bawah batas atas
 * slider); default seluruh data (perilaku lama).
 */
export function dominantBin(
  data: readonly number[],
  upto: number = data.length,
): number {
  "worklet"; // dipanggil dari AnalyzerSpectrum (useAnimatedReaction, UI thread)
  let best = -1;
  let bestVal = 0;
  const limit = Math.max(0, Math.min(data.length, upto));
  for (let i = 0; i < limit; i++) {
    const v = data[i] ?? 0;
    if (v > bestVal) {
      bestVal = v;
      best = i;
    }
  }
  return best;
}
