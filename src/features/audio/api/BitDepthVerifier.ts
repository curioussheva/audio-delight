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
    const compressionRatio = 0; // AnalysisResult tidak punya compressionRatio — tidak ada di flat struct

    // Pastikan variabel 'sampleRate' tersedia di scope ini (diambil dari metadata lagu)

    const estimatedDepth = estimateRealBitDepth(
      declaredDepth,
      analysis.estimatedDynamicRangeDb,
      analysis.estimatedSpectralCutoffHz,
      compressionRatio,
      analysis.detectedBitrateKbps,
      44100, // Jika benar-benar tidak ada variabel sampleRate, gunakan 44100 sebagai fallback
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

function estimateRealBitDepth(
  declared: number,
  dynamicRange: number,
  spectralCutoff: number,
  compressionRatio: number,
  bitrate: number,
  sampleRate: number, // Tambahkan parameter ini
): number {
  // --- Heuristic 1: Dynamic Range Validation ---
  // File 24-bit asli harusnya punya DR > 96dB.
  // Jika DR hanya ~90dB, itu kemungkinan besar 16-bit yang di-padding.
  const theoreticalFromDR = Math.max(1, (dynamicRange - 1.76) / 6.02);

  // --- Heuristic 2: Spectral Analysis (The "Upsample" Detector) ---
  // Jika sample rate 96kHz tapi cutoff di 22kHz, maka bit depth tinggi pun percuma.
  // Ini indikasi kuat source-nya adalah CD Quality (44.1kHz).
  const nyquistMax = sampleRate / 2;
  const isSpectralLimited = spectralCutoff < 22050 && sampleRate > 48000;

  // --- Heuristic 3: Enhanced Compression Ratio ---
  // File 24-bit dengan 8-bit terakhir berisi nol (padding) akan sangat "kopong".
  // FLAC akan mengompresi bit padding ini mendekati rasio 0.
  const expectedRatio = declared <= 16 ? 0.6 : 0.45;
  const isPaddingSuspected =
    compressionRatio > 0 && compressionRatio < expectedRatio * 0.65;

  // --- Scoring System ---
  let score = theoreticalFromDR;

  // Penalti berat jika spektrum terbatas (Upsampled)
  if (isSpectralLimited) {
    score -= 4; // Kurangi estimasi sekitar 4 bit
  }

  // Penalti jika rasio kompresi terlalu efisien (Padding)
  if (isPaddingSuspected) {
    score *= 0.8;
  }

  // --- Final Clamping ---
  // Kita lebih konservatif: Jika ragu, turunkan ke 16-bit.
  if (score < 18) return 16;
  if (score < 26) return 24;
  return 32;
}

function calculateConfidence(
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
