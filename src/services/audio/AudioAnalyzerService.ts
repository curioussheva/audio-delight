import { Song } from '@/types/audio';
import * as FileSystem from 'expo-file-system';
import { getAudioMetadata } from '@missingcore/audio-metadata';

export interface AnalysisResult {
  songId: string;
  isLossless: boolean;
  confidence: number;
  detectedBitrate: number;
  spectralCutoff: number;
  dynamicRange: number;
  peakFrequency: number;
  warnings: string[];
}

class AudioAnalyzerService {
  private readonly LOSSLESS_CUTOFF = 22000; 
  private readonly MP3_128_CUTOFF = 16000;
  private readonly MP3_320_CUTOFF = 20000;

  async analyzeSong(song: Song): Promise<AnalysisResult> {
    try {
      const audioUri = song.uri;
      
      // 1. Dapatkan info file & metadata
      const fileInfo = await FileSystem.getInfoAsync(audioUri);
      if (!fileInfo.exists) throw new Error('File not found');

      // 2. Gunakan parser metadata
// Coba hapus 'duration' dari array opsi jika library otomatis menyediakannya
const metadata = await getAudioMetadata(audioUri, ['name', 'artist', 'album']);
const durationSec = (metadata as any).duration || 0; 

      // Menggunakan casting ke record untuk menghindari error "Property does not exist"
      const formatInfo = (metadata as any).format || {};
      const sampleRate = formatInfo.sampleRate || 44100;
      const bitDepth = formatInfo.bitsPerSample || 16;
      
      // 3. Hitung Bitrate Riil
      const fileSizeInBits = fileInfo.size * 8;
      const bitrateKbps = durationSec > 0 ? (fileSizeInBits / durationSec) / 1000 : 0;

      // 4. Logika Deteksi
      const isLikelyLossless = bitrateKbps > 700 || bitDepth > 16;
      
      const spectralCutoff = isLikelyLossless ? 
        this.LOSSLESS_CUTOFF : 
        (bitrateKbps < 192 ? this.MP3_128_CUTOFF : this.MP3_320_CUTOFF);

      const warnings: string[] = [];
      if (bitrateKbps < 250 && !isLikelyLossless) {
        warnings.push('Kualitas rendah: Terdeteksi kompresi tinggi.');
      }
      
      if (isLikelyLossless && sampleRate < 44100) {
        warnings.push('Peringatan: Metadata Lossless tapi Sample Rate rendah.');
      }

      return {
        songId: song.id,
        isLossless: isLikelyLossless,
        confidence: isLikelyLossless ? 90 : 70,
        detectedBitrate: Math.round(bitrateKbps),
        spectralCutoff,
        dynamicRange: isLikelyLossless ? 96 : 85,
        peakFrequency: Math.round(spectralCutoff * 0.9),
        warnings,
      };
    } catch (error) {
      console.error('Analysis failed:', error);
      throw error;
    }
  }

  async batchAnalyze(songs: Song[]): Promise<AnalysisResult[]> {
    const results: AnalysisResult[] = [];
    for (const song of songs) {
      try {
        const result = await this.analyzeSong(song);
        results.push(result);
      } catch (error) {
        console.warn(`Skipping ${song.title}:`, error);
      }
    }
    return results;
  }
}

export default new AudioAnalyzerService();
