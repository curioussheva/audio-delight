// src/features/equalizer/api/graphClip.ts
//
// Matematika murni untuk peringatan clip di FrequencyGraph (tab Equalizer).
// Dipisah dari komponen supaya bisa diuji tanpa React Native / Skia.
//
// Jujur soal clip: gain di atas 0 dB BELUM tentu clip — itu tergantung
// level sinyal lagu. Karena itu pewarnaan + teksnya selalu "bisa clip",
// bukan "clip". Ambang warna (konsisten dengan skema clip Analyzer):
//   kuning  0 < gain <= BOOST_WARN_DB  (boost, waspada)
//   merah   gain > BOOST_WARN_DB       (boost besar, risiko clip tinggi)

export const BOOST_WARN_DB = 6;
export const GRAPH_CLIP_YELLOW = "#EAB308";
export const GRAPH_CLIP_RED = "#EF4444";

export interface CurveSample {
  x: number;
  y: number;
  gain: number;
}

export interface AboveZeroRuns {
  /** Polyline (titik-titik {x, y}) untuk gain 0..+6 dB. */
  warn: CurveSample[][];
  /** Polyline untuk gain > +6 dB. */
  clip: CurveSample[][];
}

/** Satu titik kurva Bezier kubik. */
export function cubicPoint(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  t: number,
): number {
  "worklet"; // dipanggil dari paths (useDerivedValue, UI thread)
  const u = 1 - t;
  return (
    u * u * u * p0 +
    3 * u * u * t * p1 +
    3 * u * t * t * p2 +
    t * t * t * p3
  );
}

/**
 * Sampel kurva halus yang sama dengan yang digambar FrequencyGraph:
 * garis kubik antar band (control point di tengah-x, y ujung). Mengembalikan
 * titik-titik beserta gain-nya. `stepsPerSegment` = sampel per ruas band.
 */
export function sampleSmoothCurve(
  bandGains: readonly number[],
  width: number,
  midY: number,
  verticalScale: number,
  stepsPerSegment = 10,
): CurveSample[] {
  "worklet"; // dipanggil dari paths (useDerivedValue, UI thread)
  const samples: CurveSample[] = [];
  if (bandGains.length === 0) return samples;
  const stepX = width / (bandGains.length - 1);
  const getY = (gain: number): number => midY - gain * verticalScale;
  const push = (x: number, y: number): void => {
    samples.push({ x, y, gain: (midY - y) / verticalScale });
  };

  push(0, getY(bandGains[0] ?? 0));
  for (let i = 1; i < bandGains.length; i++) {
    const x = i * stepX;
    const y = getY(bandGains[i] ?? 0);
    const prevX = (i - 1) * stepX;
    const prevY = getY(bandGains[i - 1] ?? 0);
    const cp1x = prevX + (x - prevX) * 0.5;
    const cp2x = prevX + (x - prevX) * 0.5;
    for (let s = 1; s <= stepsPerSegment; s++) {
      const t = s / stepsPerSegment;
      push(
        cubicPoint(prevX, cp1x, cp2x, x, t),
        cubicPoint(prevY, prevY, y, y, t),
      );
    }
  }
  return samples;
}

/**
 * Pisah sampel jadi polyline di atas garis 0 dB, menurut ambang warna.
 * Gain <= 0 tidak masuk; satu run putus begitu sampel turun ke <= 0
 * atau pindah zona warna.
 */
export function splitAboveZero(samples: readonly CurveSample[]): AboveZeroRuns {
  "worklet"; // dipanggil dari paths (useDerivedValue, UI thread)
  const warn: CurveSample[][] = [];
  const clip: CurveSample[][] = [];
  let run: CurveSample[] | null = null;
  let runIsClip = false;
  const flush = (): void => {
    if (run && run.length > 0) (runIsClip ? clip : warn).push(run);
    run = null;
  };
  for (const s of samples) {
    if (s.gain <= 0) {
      flush();
      continue;
    }
    const isClip = s.gain > BOOST_WARN_DB;
    if (!run || isClip !== runIsClip) {
      flush();
      run = [];
      runIsClip = isClip;
    }
    run.push(s);
  }
  flush();
  return { warn, clip };
}

/** Format gain maksimum untuk teks peringatan: "+6 dB", "+6.5 dB". */
export function formatBoostDb(gain: number): string {
  const s = gain % 1 === 0 ? String(gain) : gain.toFixed(1);
  return `+${s} dB`;
}

/**
 * Format frekuensi untuk label sumbu-x graph: "31", "125", "500", "2k",
 * "16k". Format yang sama dengan label fader di Band.tsx.
 */
export function formatHzLabel(freq: number): string {
  if (!Number.isFinite(freq) || freq <= 0) return "0";
  return freq < 1000 ? `${Math.round(freq)}` : `${freq / 1000}k`;
}

/**
 * Indeks band yang diberi label Hz di sumbu-x graph (C1): band pertama,
 * lalu tiap 2 band, ditambah band terakhir — dihitung dari jumlah band
 * yang sebenarnya, bukan hafalan. Untuk 10 band: [0, 2, 4, 6, 8, 9]
 * = 31/125/500/2k/8k/16k.
 */
export function graphHzLabelIndices(bandCount: number): number[] {
  const n = Math.max(0, Math.floor(bandCount));
  if (n === 0) return [];
  const picked = new Set<number>();
  for (let i = 0; i < n; i += 2) picked.add(i);
  picked.add(n - 1);
  return [...picked].sort((a, b) => a - b);
}
