// src/features/visualizer/api/spectralAnalysis.ts
//
// Panggil analisis spektral native (NativeAnalyzerModule) + validasi
// hasilnya. Tidak pernah throw — gagal (native tak tersedia, file tak
// bisa di-decode, JSON rusak) mengembalikan null, dan pemanggil
// menampilkan "tidak dapat diverifikasi", bukan verdict palsu.
//
// Dibuat 2026-11-11 (deteksi file hi-res/lossless palsu).

import NativeAnalyzerModule from "@/specs/NativeAnalyzerModule";

export interface SpectralResult {
  ok: boolean;
  durationSeconds: number;
  sampleRate: number;
  channels: number;
  measuredCutoffHz: number;
  peakDbfs: number;
  rmsDbfs: number;
  lsbZeroRatio16: number;
  windowsUsed: number;
  error?: string;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Validasi bentuk JSON dari native — jangan percaya mentah-mentah. */
export function parseSpectralJson(raw: string): SpectralResult | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const o = parsed as Record<string, unknown>;
  if (o.ok === false) {
    return {
      ok: false,
      durationSeconds: 0,
      sampleRate: 0,
      channels: 0,
      measuredCutoffHz: 0,
      peakDbfs: -120,
      rmsDbfs: -120,
      lsbZeroRatio16: 0,
      windowsUsed: 0,
      error: typeof o.error === "string" ? o.error : "analisis gagal",
    };
  }
  if (
    o.ok !== true ||
    !isFiniteNumber(o.measuredCutoffHz) ||
    !isFiniteNumber(o.sampleRate) ||
    !isFiniteNumber(o.lsbZeroRatio16)
  ) {
    return null;
  }
  return {
    ok: true,
    durationSeconds: isFiniteNumber(o.durationSeconds) ? o.durationSeconds : 0,
    sampleRate: o.sampleRate,
    channels: isFiniteNumber(o.channels) ? o.channels : 0,
    measuredCutoffHz: o.measuredCutoffHz,
    peakDbfs: isFiniteNumber(o.peakDbfs) ? o.peakDbfs : -120,
    rmsDbfs: isFiniteNumber(o.rmsDbfs) ? o.rmsDbfs : -120,
    lsbZeroRatio16: o.lsbZeroRatio16,
    windowsUsed: isFiniteNumber(o.windowsUsed) ? o.windowsUsed : 0,
  };
}

/**
 * Analisis spektral file lokal (path boleh "file://"; native memotong
 * prefix-nya). Mengembalikan null kalau native tidak tersedia / gagal.
 */
export async function analyzeFileSpectral(
  localUri: string,
): Promise<SpectralResult | null> {
  try {
    const raw = await NativeAnalyzerModule.analyzeFile(localUri);
    if (typeof raw !== "string" || raw.length === 0) return null;
    const parsed = parseSpectralJson(raw);
    if (!parsed || !parsed.ok) return null;
    return parsed;
  } catch (e) {
    console.warn("[SpectralAnalysis] gagal:", e);
    return null;
  }
}
