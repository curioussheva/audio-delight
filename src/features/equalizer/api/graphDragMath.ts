// src/features/equalizer/api/graphDragMath.ts
//
// Matematika murni untuk drag langsung pada FrequencyGraph (tab Audio Mode,
// Ide 4b). Dipisah dari komponen supaya bisa diuji tanpa React Native /
// Skia / Reanimated.
//
// Geometri SAMA dengan yang dipakai FrequencyGraph untuk menggambar kurva
// (Graph.tsx): titik band ke-i di x = i * stepX, garis 0 dB di midY, dan
// skala vertikal (height * 0.45) / 10 — jadi titik yang disentuh memetakan
// persis ke titik kurva yang terlihat di layar. Rentang gain dijepit ke
// ±10 dB (sama dengan klem store), dibulatkan ke 0.1 dB supaya satu frame
// drag tidak membanjiri bridge dengan nilai yang nyaris sama.

/** Gain maksimum yang terlihat di graph (sama dengan `maxGainVisible`). */
export const GRAPH_DRAG_MAX_GAIN_DB = 10;

/** Fraksi tinggi canvas untuk rentang gain penuh ±10 dB. */
export const GRAPH_DRAG_VERTICAL_FRACTION = 0.45;

function graphStepX(width: number, bandCount: number): number {
  "worklet"; // dipanggil dari gesture (UI thread)
  return bandCount > 1 ? width / (bandCount - 1) : width;
}

function graphMidY(height: number): number {
  "worklet"; // dipanggil dari gesture (UI thread)
  return height / 2;
}

function graphVerticalScale(height: number): number {
  "worklet"; // dipanggil dari gesture (UI thread)
  return (height * GRAPH_DRAG_VERTICAL_FRACTION) / GRAPH_DRAG_MAX_GAIN_DB;
}

function clamp(value: number, min: number, max: number): number {
  "worklet"; // dipanggil dari gesture (UI thread)
  return Math.min(max, Math.max(min, value));
}

export interface GraphDragResult {
  /** Indeks band terdekat dengan titik sentuh. */
  index: number;
  /** Gain baru band itu, -10..+10 dB, dibulatkan ke 0.1 dB. */
  gain: number;
}

/**
 * Titik sentuh (x, y) dalam koordinat canvas -> band + gain.
 * x di luar canvas dijepit ke band pertama/terakhir, y di luar dijepit
 * ke ±10 dB. Koordinat bukan angka (NaN) mengembalikan band 0 / 0 dB
 * supaya tidak ada NaN yang lolos ke store.
 */
export function pointToBand(
  x: number,
  y: number,
  width: number,
  height: number,
  bandCount: number,
): GraphDragResult {
  "worklet"; // dipanggil dari gesture (UI thread)
  if (!Number.isFinite(x) || !Number.isFinite(y) || bandCount <= 0) {
    return { index: 0, gain: 0 };
  }
  const stepX = graphStepX(width, bandCount);
  const midY = graphMidY(height);
  const verticalScale = graphVerticalScale(height);
  const index = clamp(Math.round(x / stepX), 0, bandCount - 1);
  const rawGain = (midY - y) / verticalScale;
  const rounded =
    Math.round(
      clamp(rawGain, -GRAPH_DRAG_MAX_GAIN_DB, GRAPH_DRAG_MAX_GAIN_DB) * 10,
    ) / 10;
  // -0 dibulatkan dari nilai negatif kecil (mis. -0.04) — normalkan ke 0
  // supaya fader tidak menampilkan "-0".
  return { index, gain: rounded === 0 ? 0 : rounded };
}

export interface GraphBandPoint {
  x: number;
  y: number;
}

/**
 * Kebalikan pointToBand: posisi canvas titik band ke-`index` pada `gain`
 * dB — dipakai untuk dot penanda band aktif saat drag.
 */
export function bandPoint(
  index: number,
  gain: number,
  width: number,
  height: number,
  bandCount: number,
): GraphBandPoint {
  "worklet"; // dipanggil dari gesture (UI thread)
  const stepX = graphStepX(width, bandCount);
  const midY = graphMidY(height);
  const verticalScale = graphVerticalScale(height);
  return {
    x: index * stepX,
    y: midY - gain * verticalScale,
  };
}
