import { Song } from '@/types/audio';
import * as FileSystem from 'expo-file-system';
import { getAudioMetadata } from '@missingcore/audio-metadata';

export interface AnalysisResult {
  songId: string;
  isLossless: boolean;
  confidence: number;        // 0–100
  detectedBitrateKbps: number;
  estimatedSpectralCutoffHz: number;
  estimatedDynamicRangeDb: number;
  peakFrequencyHz: number;
  warnings: string[];
}

interface AnalyzerConfig {
  losslessCutoffHz?: number;
  mp3128CutoffHz?: number;
  mp3320CutoffHz?: number;
  highBitrateThresholdKbps?: number;
  veryHighBitrateThresholdKbps?: number;
}

const DEFAULT_CONFIG: Required<AnalyzerConfig> = {
  losslessCutoffHz: 22050,
  mp3128CutoffHz: 16000,
  mp3320CutoffHz: 20000,
  highBitrateThresholdKbps: 650,      // lowered from 700 – more realistic for FLAC/ALAC
  veryHighBitrateThresholdKbps: 1400, // e.g. 24-bit/96kHz+
};

const LOSSLESS_EXTENSIONS = /\.(flac|wav|wave|aiff|aif|alac|m4a|ape|wma)$/i;

 export class AudioAnalyzerService {
  private config: Required<AnalyzerConfig>;

  constructor(config: AnalyzerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Analyzes a single audio file and estimates if it's likely lossless.
   */
  async analyzeSong(song: Song): Promise<AnalysisResult> {
    try {
      const { uri, id, title = 'Unknown' } = song;

      // 1. Verify file exists
      const fileInfo = await FileSystem.getInfoAsync(uri);
      if (!fileInfo.exists || fileInfo.isDirectory) {
        throw new Error(`File not found or is directory: ${uri}`);
      }

      // 2. Read metadata
      const metadata: any = await getAudioMetadata(uri, ['name', 'artist', 'album', 'duration'] as any);
      
      // 3. Extract useful fields safely
      const durationMs = Number(metadata.duration ?? 0);
      const durationSec = durationMs > 5000 ? durationMs / 1000 : durationMs;

      const format = (metadata.format as unknown as Record<string, any>) ?? {};
      const sampleRate = Number(format.sampleRate ?? 44100);
      const bitDepth = Number(format.bitsPerSample ?? 16);

      // 4. Calculate real average bitrate
      const fileSizeBits = fileInfo.size * 8;
      const bitrateKbps = durationSec > 0.1 ? (fileSizeBits / durationSec) / 1000 : 0;

      // 5. Determine if likely lossless
      const extensionLooksLossless = LOSSLESS_EXTENSIONS.test(uri);
      const bitrateLooksHigh = bitrateKbps >= this.config.highBitrateThresholdKbps;
      const bitDepthLooksHigh = bitDepth > 16;

      const isLikelyLossless = extensionLooksLossless && (bitrateLooksHigh || bitDepthLooksHigh);

      // 6. Estimate spectral cutoff
      let spectralCutoffHz: number;
      if (isLikelyLossless) {
        spectralCutoffHz = this.config.losslessCutoffHz;
      } else if (bitrateKbps < 180) {
        spectralCutoffHz = this.config.mp3128CutoffHz;
      } else {
        spectralCutoffHz = this.config.mp3320CutoffHz;
      }
      
      // 7. Collect warnings
      const warnings: string[] = [];

      if (!extensionLooksLossless && isLikelyLossless) {
        warnings.push("High bitrate/bit-depth, but file extension suggests lossy format");
      }
      if (extensionLooksLossless && bitrateKbps < 350) {
        warnings.push("Lossless extension but unusually low bitrate – possible bad rip/transcode");
      }
      if (bitrateKbps < 180 && !isLikelyLossless) {
        warnings.push("Low bitrate – likely heavily compressed (≤128 kbps quality)");
      }
      if (sampleRate < 44100 && isLikelyLossless) {
        warnings.push("Lossless candidate but sample rate below 44.1 kHz");
      }

      return {
        songId: id,
        isLossless: isLikelyLossless,
        confidence: isLikelyLossless ? 88 : 65,
        detectedBitrateKbps: Math.round(bitrateKbps),
        estimatedSpectralCutoffHz: Math.round(spectralCutoffHz),
        estimatedDynamicRangeDb: isLikelyLossless ? 96 : 84,
        peakFrequencyHz: Math.round(spectralCutoffHz * 0.92),
        warnings,
      };
    } catch (error) {
      console.error(`Audio analysis failed for "${song.title ?? song.id}":`, error);
      throw error;
    }
  }

  /**
   * Analyzes multiple songs in parallel chunks to avoid overwhelming memory/CPU
   */
  async batchAnalyze(songs: Song[], options: { chunkSize?: number } = {}): Promise<AnalysisResult[]> {
    const { chunkSize = 4 } = options;
    const results: AnalysisResult[] = [];

    for (let i = 0; i < songs.length; i += chunkSize) {
      const chunk = songs.slice(i, i + chunkSize);
      
      const chunkPromises = chunk.map(async (song) => {
        try {
          return await this.analyzeSong(song);
        } catch (err) {
          console.warn(`Skipped analysis for "${song.title ?? song.id}":`, err);
          return null;
        }
      });

      const chunkResults = await Promise.all(chunkPromises);
      results.push(...chunkResults.filter((r): r is AnalysisResult => r !== null));
    }

    return results;
  }
}

// Singleton instance (recommended for services)
export const audioAnalyzer = new AudioAnalyzerService();

// Optional: create with custom thresholds
// export const strictAnalyzer = new AudioAnalyzerService({
//   highBitrateThresholdKbps: 800,
//   losslessCutoffHz: 22050,
// });