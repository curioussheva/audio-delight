import { Audio } from 'expo-av';
import { Song } from '@/types/audio';
import * as FileSystem from 'expo-file-system';

export interface AnalysisResult {
  songId: string;
  isLossless: boolean;
  confidence: number; // 0-100%
  detectedBitrate: number; // bitrate terdeteksi (untuk transcode detection)
  spectralCutoff: number; // frekuensi cutoff dalam Hz
  dynamicRange: number; // dynamic range dalam dB
  peakFrequency: number; // frekuensi puncak
  spectogramData?: number[][]; // data untuk visualisasi
  warnings: string[];
}

class AudioAnalyzerService {
  private readonly LOSSLESS_CUTOFF = 22000; // FLAC asli biasanya sampai 22kHz
  private readonly MP3_128_CUTOFF = 16000; // MP3 128kbps cutoff di 16kHz
  private readonly MP3_320_CUTOFF = 20000; // MP3 320kbps cutoff di 20kHz

  async analyzeSong(song: Song): Promise<AnalysisResult> {
    try {
      // Baca file audio
      const audioUri = song.uri;
      const fileInfo = await FileSystem.getInfoAsync(audioUri);
      
      if (!fileInfo.exists) {
        throw new Error('File not found');
      }

      // Load audio untuk analisis
      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUri },
        { shouldPlay: false }
      );

      // Dapatkan status untuk durasi
      const status = await sound.getStatusAsync();
      
      // Di sini kita perlu native module untuk akses PCM data
      // Untuk MVP, kita gunakan simulasi berdasarkan ukuran file
      
      const fileSizeMB = fileInfo.size / (1024 * 1024);
      const durationSec = (status as any).durationMillis / 1000;
      const bitrateKbps = (fileSizeMB * 8 * 1024) / durationSec; // Estimasi

      // Deteksi kualitas berdasarkan bitrate
      const isLikelyLossless = bitrateKbps > 800; // FLAC biasanya >800kbps
      
      // Simulasi spectral cutoff (dalam real implementation, ini dari FFT)
      const spectralCutoff = isLikelyLossless ? 
        this.LOSSLESS_CUTOFF : 
        (bitrateKbps < 200 ? this.MP3_128_CUTOFF : this.MP3_320_CUTOFF);

      // Dynamic range (simulasi)
      const dynamicRange = isLikelyLossless ? 
        96 + Math.random() * 20 : // 96-116dB untuk lossless
        80 + Math.random() * 15;  // 80-95dB untuk lossy

      const warnings = [];
      if (bitrateKbps < 200) {
        warnings.push('Kualitas rendah (kemungkinan MP3 128kbps)');
      } else if (bitrateKbps < 400) {
        warnings.push('Kualitas sedang (kemungkinan MP3 320kbps)');
      }

      if (spectralCutoff < this.LOSSLESS_CUTOFF) {
        warnings.push('Frekuensi terpotong - kemungkinan hasil transcode');
      }

      await sound.unloadAsync();

      return {
        songId: song.id,
        isLossless: isLikelyLossless && spectralCutoff >= this.LOSSLESS_CUTOFF,
        confidence: isLikelyLossless ? 85 : 60,
        detectedBitrate: Math.round(bitrateKbps),
        spectralCutoff,
        dynamicRange: Math.round(dynamicRange),
        peakFrequency: Math.round(spectralCutoff * 0.8), // Simulasi
        warnings,
      };
    } catch (error) {
      console.error('Analysis failed:', error);
      throw error;
    }
  }

  async generateSpectogram(song: Song): Promise<number[][]> {
    // Dalam implementasi nyata, ini akan menghasilkan data FFT
    // Untuk MVP, kita buat data simulasi
    
    const spectogram: number[][] = [];
    const timeSteps = 100; // 100 titik waktu
    const freqBins = 256; // 256 bin frekuensi

    for (let t = 0; t < timeSteps; t++) {
      const slice: number[] = [];
      for (let f = 0; f < freqBins; f++) {
        // Simulasi data spektogram dengan pola yang masuk akal
        const freq = (f / freqBins) * 24000; // 0-24kHz
        let amplitude = 0;
        
        // Bass region (20-250Hz)
        if (freq < 250) {
          amplitude = 0.8 + 0.2 * Math.sin(t * 0.1);
        }
        // Mid region (250Hz-4kHz)  
        else if (freq < 4000) {
          amplitude = 0.5 + 0.3 * Math.sin(t * 0.2 + freq * 0.001);
        }
        // High region (4kHz-24kHz)
        else {
          amplitude = 0.3 + 0.1 * Math.sin(t * 0.3 + freq * 0.0005);
        }
        
        slice.push(amplitude);
      }
      spectogram.push(slice);
    }

    return spectogram;
  }

  async batchAnalyze(songs: Song[]): Promise<AnalysisResult[]> {
    const results: AnalysisResult[] = [];
    for (const song of songs) {
      try {
        const result = await this.analyzeSong(song);
        results.push(result);
      } catch (error) {
        console.error(`Failed to analyze ${song.title}:`, error);
      }
    }
    return results;
  }
}

export default new AudioAnalyzerService();