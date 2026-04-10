// src/features/visualizer/api/analyzer.ts

import { Song } from "@/shared/types/audio";
import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import { getAudioMetadata } from "@missingcore/audio-metadata";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AnalysisResult {
  songId: string;
  isLossless: boolean;
  confidence: number;
  detectedBitrateKbps: number;
  estimatedSpectralCutoffHz: number;
  estimatedDynamicRangeDb: number;
  peakFrequencyHz: number;
  warnings: string[];
  analysisMethod: "heuristic" | "fft" | "metadata";
  format: {
    codec: string;
    sampleRate: number;
    bitDepth: number;
    channels: number;
  };
}

interface AnalyzerConfig {
  losslessCutoffHz?: number;
  mp3128CutoffHz?: number;
  mp3320CutoffHz?: number;
  highBitrateThresholdKbps?: number;
  veryHighBitrateThresholdKbps?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: Required<AnalyzerConfig> = {
  losslessCutoffHz: 22050,
  mp3128CutoffHz: 16000,
  mp3320CutoffHz: 20000,
  highBitrateThresholdKbps: 650,
  veryHighBitrateThresholdKbps: 1400,
};

const LOSSLESS_CODECS = new Set([
  "FLAC",
  "ALAC",
  "WAV",
  "AIFF",
  "APE",
  "WAVPACK",
  "TTA",
  "DSD",
]);

const LOSSY_CODECS = new Set([
  "MP3",
  "AAC",
  "OGG",
  "VORBIS",
  "OPUS",
  "WMA",
  "MUSEPACK",
]);

const EXT_TO_CODEC: Record<string, string> = {
  mp3: "MP3",
  flac: "FLAC",
  wav: "WAV",
  wave: "WAV",
  aiff: "AIFF",
  aif: "AIFF",
  m4a: "ALAC",
  aac: "AAC",
  ogg: "OGG",
  opus: "OPUS",
  wma: "WMA",
  ape: "APE",
  dsf: "DSD",
  dff: "DSD",
};

// ─────────────────────────────────────────────────────────────────────────────
// URI Resolver — content:// → file:// cache
// ─────────────────────────────────────────────────────────────────────────────

async function resolveToLocalUri(
  uri: string,
  filename: string,
): Promise<{ localUri: string; tempPath: string | null }> {
  // file:// sudah bisa langsung dipakai
  if (!uri.startsWith("content://")) return { localUri: uri, tempPath: null };

  const assetId = uri.split("/").pop() ?? "";
  const assetInfo = await MediaLibrary.getAssetInfoAsync(assetId);
  const sourceUri = assetInfo.localUri ?? assetInfo.uri;

  if (!sourceUri) throw new Error(`Cannot resolve localUri for: ${uri}`);

  const ext = filename.split(".").pop()?.toLowerCase() ?? "mp3";
  const tempPath = `${FileSystem.cacheDirectory}analyze_${Date.now()}.${ext}`;
  await FileSystem.copyAsync({ from: sourceUri, to: tempPath });

  return { localUri: tempPath, tempPath };
}

async function cleanupTemp(tempPath: string | null): Promise<void> {
  if (!tempPath) return;
  try {
    await FileSystem.deleteAsync(tempPath, { idempotent: true });
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Codec Detection
// ─────────────────────────────────────────────────────────────────────────────

function detectCodec(song: Song, metaCodec?: string): string {
  // 1. Dari metadata (paling akurat)
  if (metaCodec) return metaCodec.toUpperCase();

  // 2. Dari extension filename (lebih reliable dari URI untuk content://)
  const source = song.filename || song.uri;
  const ext = source.split(".").pop()?.toLowerCase() ?? "";
  return (EXT_TO_CODEC[ext] ?? "UNKNOWN").toUpperCase();
}

// ─────────────────────────────────────────────────────────────────────────────
// Lossless Score
// ─────────────────────────────────────────────────────────────────────────────

interface LosslessScore {
  isLikelyLossless: boolean;
  confidence: number;
}

function scoreLossless(params: {
  codec: string;
  filename: string;
  bitDepth: number;
  sampleRate: number;
  bitrateKbps: number;
  uncompressedKbps: number;
}): LosslessScore {
  const {
    codec,
    filename,
    bitDepth,
    sampleRate,
    bitrateKbps,
    uncompressedKbps,
  } = params;
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const extLossless = [
    "flac",
    "wav",
    "wave",
    "aiff",
    "aif",
    "alac",
    "ape",
    "dsf",
    "dff",
  ].includes(ext);

  let score = 0;
  let weight = 0;

  const add = (s: number, w: number) => {
    score += s;
    weight += w;
  };

  if (extLossless) add(30, 30);
  if (LOSSLESS_CODECS.has(codec)) add(35, 35);
  else if (LOSSY_CODECS.has(codec)) add(-20, 20);
  if (bitDepth > 16) add(25, 25);
  if (sampleRate > 48000) add(10, 10);

  const bitrateRatio =
    uncompressedKbps > 0 ? bitrateKbps / uncompressedKbps : 0;
  if (bitrateRatio > 0.5) add(15, 15);
  else if (bitrateRatio < 0.3 && bitrateKbps > 0) add(-25, 25);

  const isLikelyLossless = score > weight * 0.6;
  const confidence = Math.min(
    100,
    Math.max(0, 50 + (score / Math.max(weight, 1)) * 50),
  );

  return { isLikelyLossless, confidence: Math.round(confidence) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Spectral Cutoff Estimation
// ─────────────────────────────────────────────────────────────────────────────

function estimateSpectralCutoff(
  codec: string,
  bitrateKbps: number,
  sampleRate: number,
  isLossless: boolean,
  config: Required<AnalyzerConfig>,
): number {
  const nyquist = sampleRate / 2;

  if (isLossless) return Math.min(nyquist, config.losslessCutoffHz);

  if (codec === "MP3") {
    if (bitrateKbps <= 128) return config.mp3128CutoffHz;
    if (bitrateKbps <= 192) return 18000;
    if (bitrateKbps <= 320) return config.mp3320CutoffHz;
    return 20000;
  }

  if (codec === "AAC" || codec === "OGG" || codec === "OPUS") {
    return Math.min(20000, nyquist * 0.9);
  }

  return bitrateKbps < 200 ? config.mp3128CutoffHz : config.mp3320CutoffHz;
}

// ─────────────────────────────────────────────────────────────────────────────
// Warnings
// ─────────────────────────────────────────────────────────────────────────────

function collectWarnings(params: {
  codec: string;
  filename: string;
  bitDepth: number;
  sampleRate: number;
  bitrateKbps: number;
  isLossless: boolean;
}): string[] {
  const { codec, filename, bitDepth, sampleRate, bitrateKbps, isLossless } =
    params;
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const extLossless = ["flac", "wav", "aiff", "alac", "ape", "dsf"].includes(
    ext,
  );
  const warnings: string[] = [];

  if (isLossless && LOSSY_CODECS.has(codec))
    warnings.push(
      `High quality indicators but codec is ${codec} (typically lossy)`,
    );

  if (!isLossless && LOSSLESS_CODECS.has(codec))
    warnings.push(
      `${codec} file but bitrate (${bitrateKbps} kbps) unusually low`,
    );

  if (bitrateKbps > 0 && bitrateKbps < 128)
    warnings.push(
      `Very low bitrate (${bitrateKbps} kbps) — heavily compressed`,
    );

  if (sampleRate < 44100)
    warnings.push(`Low sample rate (${sampleRate} Hz) — below CD quality`);

  if (bitDepth > 24)
    warnings.push(`Unusual bit depth (${bitDepth}-bit) — verify authenticity`);

  if (extLossless && bitrateKbps > 0 && bitrateKbps < 400)
    warnings.push(
      "Possible transcode from lossy source (bitrate too low for lossless)",
    );

  return warnings;
}

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

export class AudioAnalyzerService {
  private config: Required<AnalyzerConfig>;

  constructor(config: AnalyzerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async analyzeSong(song: Song): Promise<AnalysisResult> {
    let tempPath: string | null = null;

    try {
      // 1. Resolve URI ke file:// yang bisa dibaca
      const resolved = await resolveToLocalUri(song.uri, song.filename ?? "");
      tempPath = resolved.tempPath;
      const workingUri = resolved.localUri;

      // 2. Verifikasi file ada
      const fileInfo = await FileSystem.getInfoAsync(workingUri);
      if (!fileInfo.exists || fileInfo.isDirectory) {
        throw new Error(`File not found: ${workingUri}`);
      }

      // 3. Baca metadata
      const meta: any = await getAudioMetadata(workingUri, [
        "name",
        "artist",
        "album",
        "duration",
        "bitrate",
      ] as any);

      // 4. Ekstrak fields
      const durationMs = Number(meta.duration ?? 0);
      const durationSec = durationMs > 5000 ? durationMs / 1000 : durationMs;
      const fmt = (meta.format as Record<string, any>) ?? {};
      const sampleRate = Number(fmt.sampleRate ?? song.sampleRate ?? 44100);
      const bitDepth = Number(fmt.bitsPerSample ?? song.bitDepth ?? 16);
      const channels = Number(fmt.channels ?? 2);
      const codec = detectCodec(song, fmt.codec);

      // 5. Bitrate
      const metaBitrateKbps =
        Number(meta.bitrate ?? 0) > 1000
          ? Math.round(Number(meta.bitrate) / 1000)
          : 0;
      const calcBitrateKbps =
        durationSec > 0.1
          ? Math.round((fileInfo.size * 8) / durationSec / 1000)
          : 0;
      const bitrateKbps = metaBitrateKbps || calcBitrateKbps;

      const uncompressedKbps = (sampleRate * bitDepth * channels) / 1000;

      // 6. Lossless scoring
      const { isLikelyLossless, confidence } = scoreLossless({
        codec,
        filename: song.filename ?? "",
        bitDepth,
        sampleRate,
        bitrateKbps,
        uncompressedKbps,
      });

      // 7. Spectral cutoff
      const spectralCutoff = estimateSpectralCutoff(
        codec,
        bitrateKbps,
        sampleRate,
        isLikelyLossless,
        this.config,
      );

      // 8. Dynamic range (teoritis, PCM SNR formula)
      const dynamicRange = isLikelyLossless
        ? Math.round(6.02 * bitDepth + 1.76)
        : Math.max(75, Math.round(6.02 * 16 - 12));

      // 9. Warnings
      const warnings = collectWarnings({
        codec,
        filename: song.filename ?? "",
        bitDepth,
        sampleRate,
        bitrateKbps,
        isLossless: isLikelyLossless,
      });

      return {
        songId: song.id,
        isLossless: isLikelyLossless,
        confidence,
        detectedBitrateKbps: bitrateKbps,
        estimatedSpectralCutoffHz: Math.round(spectralCutoff),
        estimatedDynamicRangeDb: dynamicRange,
        peakFrequencyHz: Math.round(spectralCutoff * 0.95),
        warnings,
        analysisMethod: "heuristic",
        format: { codec, sampleRate, bitDepth, channels },
      };
    } catch (error) {
      console.error(
        `Audio analysis failed for "${song.title ?? song.id}":`,
        error,
      );
      return this._unknownResult(song.id);
    } finally {
      await cleanupTemp(tempPath);
    }
  }

  async batchAnalyze(
    songs: Song[],
    options: {
      chunkSize?: number;
      onProgress?: (done: number, total: number) => void;
    } = {},
  ): Promise<AnalysisResult[]> {
    const { chunkSize = 4, onProgress } = options;
    const results: AnalysisResult[] = [];
    let processed = 0;

    for (let i = 0; i < songs.length; i += chunkSize) {
      const chunk = songs.slice(i, i + chunkSize);
      const chunkResults = await Promise.all(
        chunk.map(async (song) => {
          const result = await this.analyzeSong(song);
          onProgress?.(++processed, songs.length);
          return result;
        }),
      );
      results.push(...chunkResults);
    }

    return results;
  }

  private _unknownResult(songId: string): AnalysisResult {
    return {
      songId,
      isLossless: false,
      confidence: 0,
      detectedBitrateKbps: 0,
      estimatedSpectralCutoffHz: 0,
      estimatedDynamicRangeDb: 0,
      peakFrequencyHz: 0,
      warnings: ["Analysis failed — unable to determine audio quality"],
      analysisMethod: "heuristic",
      format: { codec: "UNKNOWN", sampleRate: 0, bitDepth: 0, channels: 0 },
    };
  }
}

export const audioAnalyzer = new AudioAnalyzerService();
