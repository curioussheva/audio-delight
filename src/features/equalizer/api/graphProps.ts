// src/features/equalizer/api/graphProps.ts
//
// Perbandingan props FrequencyGraph untuk React.memo — berdasarkan NILAI.
//
// Store membuat array `bands` baru di tiap set(), jadi perbandingan
// default memo (identitas referensi) selalu gagal dan grafik me-render
// ulang di tiap tick drag — termasuk saat yang digeser slider efek
// (bands tidak berubah sama sekali). Dengan perbandingan nilai, grafik
// hanya me-render ulang bila kurvanya benar-benar berubah.
//
// Modul MURNI (tanpa dependensi runtime React Native) supaya bisa diuji
// jest — lihat jest.config.cjs: tes hanya untuk logika murni.
import type { EqualizerBand } from "@/features/equalizer/types";

/**
 * Bentuk minimal SharedValue yang dipakai comparator: hanya `.value`.
 * SharedValue asli (reanimated) memenuhi bentuk ini secara struktural,
 * jadi tidak perlu mengimpor tipenya — modul tetap murni.
 */
export type SharedValueLike<T> = { value: T };

/**
 * Bentuk props FrequencyGraph yang relevan untuk perbandingan memo.
 * Semua field opsional/nullable supaya pemakaian di tes tidak perlu
 * membangun props lengkap; Graph.tsx meneruskan Props-nya apa adanya
 * (structural typing — Props punya semua field ini).
 */
export interface FrequencyGraphPropsInput {
  bands?: SharedValueLike<EqualizerBand[]> | EqualizerBand[] | null;
  combinedGains?: readonly number[] | null;
  width?: number;
  height?: number;
  disabled?: boolean;
  onBandChange?: (index: number, gain: number) => void;
  bassBoostDb?: number;
  masterGainDb?: number;
}

/** Samakan dua array angka berdasarkan NILAI (bukan identitas referensi). */
export function gainsEqual(
  a: readonly number[] | null | undefined,
  b: readonly number[] | null | undefined,
): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Samakan dua daftar band berdasarkan NILAI (frekuensi + gain tiap band). */
export function bandsEqual(
  a: SharedValueLike<EqualizerBand[]> | EqualizerBand[] | null | undefined,
  b: SharedValueLike<EqualizerBand[]> | EqualizerBand[] | null | undefined,
): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  // SharedValue dibandingkan referensi saja (sudah ditangani di atas):
  // isinya bisa dimutasi di tempat lewat .value, jadi perbandingan nilai
  // tidak bisa dipercaya — aman: anggap beda, grafik re-render.
  // Pemakaian di layar ini selalu array biasa.
  if ("value" in a || "value" in b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].frequency !== b[i].frequency || a[i].gain !== b[i].gain)
      return false;
  }
  return true;
}

/**
 * Perbandingan props FrequencyGraph untuk React.memo — berdasarkan NILAI.
 * Dipakai sebagai argumen kedua React.memo di Graph.tsx.
 */
export function areFrequencyGraphPropsEqual(
  prev: FrequencyGraphPropsInput,
  next: FrequencyGraphPropsInput,
): boolean {
  return (
    (prev.width ?? 340) === (next.width ?? 340) &&
    (prev.height ?? 120) === (next.height ?? 120) &&
    prev.disabled === next.disabled &&
    (prev.bassBoostDb ?? 0) === (next.bassBoostDb ?? 0) &&
    (prev.masterGainDb ?? 0) === (next.masterGainDb ?? 0) &&
    prev.onBandChange === next.onBandChange &&
    bandsEqual(prev.bands, next.bands) &&
    gainsEqual(prev.combinedGains, next.combinedGains)
  );
}
