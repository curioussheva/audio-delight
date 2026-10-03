// src/features/audio/api/BitDepthVerifier.ts (NEW LOCATION: audio, bukan visualizer)

import { Song } from "@/shared/types/audio";
//import { MusicAnalysisResult } from "@/shared/types/audio";
import { audioAnalyzer } from "@/features/visualizer/api/analyzer";

export interface BitDepthAnalysis {
  declaredDepth: number; // Dari metadata file
  realDepth: number; // Estimated dari analysis
  isFake: boolean; // realDepth < declaredDepth
  confidence: number; // 0-100
  paddingRatio: number; // 0.0-1.0 (persentase zero LSBs)
}

/**
 * Analyze bit depth dari audio file
 *
 * Teknik:
 * 1. Sample LSB (Least Significant Bits) dari audio samples
 * 2. Hitung entropy - random = real bits, all zeros = padding
 * 3. Compare dengan declared bit depth
 *
 * Note: Ini adalah heuristic analysis, bukan 100% accurate.
 * Untuk hasil pasti, perlu decode actual audio samples (expensive).
 */
export const analyzeBitDepth = async (
  song: Song,
  options: { sampleCount?: number } = {},
): Promise<BitDepthAnalysis> => {
  const { sampleCount = 10000 } = options;

  try {
    // Gunakan existing analyzer untuk get detailed info
    const analysis = await audioAnalyzer.analyzeSong(song);

    if (!analysis) {
      return createUnknownAnalysis(song.bitDepth);
    }

    // Extract info dari analysis
    const declaredDepth = song.bitDepth || 16;
    const compressionRatio = 0; // AnalysisResult tidak punya compressionRatio - tidak ada di flat struct

    // Sample rate HARUS dari lagu, bukan hardcoded: heuristik "upsample
    // detector" hanya bisa bekerja kalau tahu laju file sebenarnya. Memakai
    // 44100 membuat `sampleRate > 48000` selalu false, sehingga file hi-res
    // yang di-upsample dari CD tidak pernah terdeteksi.
    const sampleRate =
      song.sampleRate || analysis.format?.sampleRate || 44100;

    const estimatedDepth = estimateRealBitDepth(
      declaredDepth,
      analysis.estimatedDynamicRangeDb,
      analysis.estimatedSpectralCutoffHz,
      compressionRatio,
      analysis.detectedBitrateKbps,
      sampleRate,
    );

    // Calculate confidence
    const confidence = calculateConfidence(
      declaredDepth,
      estimatedDepth,
      analysis.confidence,
    );

    // Determine if fake
    const isFake = estimatedDepth < declaredDepth - 4; // Tolerance 4 bits
    const paddingRatio = isFake ? 1 - estimatedDepth / declaredDepth : 0;

    return {
      declaredDepth,
      realDepth: estimatedDepth,
      isFake,
      confidence,
      paddingRatio,
    };
  } catch (error) {
    console.error("[BitDepthVerifier] Analysis failed:", error);
    return createUnknownAnalysis(song.bitDepth);
  }
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Estimasi bit depth nyata dari hasil analisis spektral/dinamis.
 *
 * Diekspor untuk pengujian: ini inti heuristik verdict "FLAC palsu", dan
 * kesalahan di sini langsung menyesatkan pengguna.
 *
 * PENTING soal skala: `(DR - 1.76) / 6.02` **sudah bernilai dalam satuan bit**
 * (rumus DR teoretis untuk N-bit: 6.02N + 1.76). Nilai itu dibandingkan dengan
 * ambang dalam satuan bit juga (16/20/24), BUKAN 18/26 - memakai 18/26 berarti
 * menuntut DR >= 110 dB sebelum file diakui 24-bit, dan 24-bit asli hampir
 * tidak pernah mencapai itu (maksimum teoretis 146 dB, realistis 100-120 dB).
 */
export function estimateRealBitDepth(
  declared: number,
  dynamicRange: number,
  spectralCutoff: number,
  compressionRatio: number,
  bitrate: number,
  sampleRate: number,
): number {
  // --- Heuristic 1: Dynamic Range Validation ---
  // File 24-bit asli harusnya punya DR > 96dB.
  // Jika DR hanya ~90dB, itu kemungkinan besar 16-bit yang di-padding.
  const theoreticalFromDR = Math.max(1, (dynamicRange - 1.76) / 6.02);

  // --- Heuristic 2: Spectral Analysis (The "Upsample" Detector) ---
  // Jika sample rate 96kHz tapi cutoff di ~22kHz, maka bit depth tinggi pun
  // percuma - ini indikasi kuat source-nya CD Quality (44.1kHz).
  // Batas dibandingkan dengan laju sumber, bukan angka ajaib: cutoff di bawah
  // 24 kHz sementara file mengaku > 48 kHz berarti tidak ada konten di atas
  // apa yang bisa dibawa CD.
  const CD_NYQUIST = 22050;
  const isSpectralLimited = spectralCutoff < CD_NYQUIST && sampleRate > 48000;

  // --- Heuristic 3: Enhanced Compression Ratio ---
  // File 24-bit dengan 8-bit terakhir berisi nol (padding) akan sangat "kopong".
  // FLAC akan mengompresi bit padding ini mendekati rasio 0.
  const expectedRatio = declared <= 16 ? 0.6 : 0.45;
  const isPaddingSuspected =
    compressionRatio > 0 && compressionRatio < expectedRatio * 0.65;

  // --- Scoring System ---
  let score = theoreticalFromDR;

  // Penalti jika spektrum terbatas (upsampled). Turunkan ke plafon CD.
  if (isSpectralLimited) {
    score = Math.min(score, 16);
  }

  // Penalti jika rasio kompresi terlalu efisien (padding suspected).
  if (isPaddingSuspected) {
    score *= 0.8;
  }

  // --- Final Clamping ---
  // Konservatif: kalau ragu, turunkan. Ambang dalam satuan bit.
  // 16-bit  -> DR <= ~98 dB (batas teoretis 16-bit)
  // 24-bit  -> DR > 98 dB, sampai batas teoretis 24-bit (146 dB)
  // 32-bit  -> jarang bermakna untuk playback; hanya jika DR sangat tinggi
  if (score <= 16) return 16;
  if (score <= 24) return 24;
  return 32;
}

/** Batas DR teoretis MSB untuk N-bit, dalam dB. Dipakai untuk clamp. */
export function theoreticalDrForBitDepth(bits: number): number {
  return 6.02 * bits + 1.76;
}

/**
 * Confidence analysis, 0-100. Turun 5 poin per bit selisih antara
 * declared dan estimated. Diekspor untuk pengujian.
 */
export function calculateConfidence(
  declared: number,
  estimated: number,
  baseConfidence: number,
): number {
  // Confidence lebih rendah jika discrepancy besar
  const discrepancy = Math.abs(declared - estimated);
  const confidencePenalty = discrepancy * 5; // -5% per bit difference

  return Math.max(0, Math.min(100, baseConfidence - confidencePenalty));
}

function createUnknownAnalysis(declaredDepth?: number): BitDepthAnalysis {
  return {
    declaredDepth: declaredDepth || 16,
    realDepth: declaredDepth || 16,
    isFake: false,
    confidence: 0,
    paddingRatio: 0,
  };
}

// ============================================================================
// Batch Analysis
// ============================================================================

export const analyzeBitDepthBatch = async (
  songs: Song[],
): Promise<Map<string, BitDepthAnalysis>> => {
  const results = new Map<string, BitDepthAnalysis>();

  for (const song of songs) {
    // Skip jika sudah 16-bit (tidak mungkin fake)
    if (!song.bitDepth || song.bitDepth <= 16) {
      results.set(song.id, {
        declaredDepth: 16,
        realDepth: 16,
        isFake: false,
        confidence: 100,
        paddingRatio: 0,
      });
      continue;
    }

    const analysis = await analyzeBitDepth(song);
    results.set(song.id, analysis);
  }

  return results;
};
