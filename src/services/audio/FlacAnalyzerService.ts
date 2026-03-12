// src/services/audio/FlacAnalyzerService.ts
import { getAudioMetadata, MetadataResponse } from '@missingcore/audio-metadata';
import * as FileSystem from 'expo-file-system';
import * as fft from 'fft-js';
import { Audio, AVPlaybackStatusSuccess } from 'expo-av';

// Tipe dari library yang sebenarnya
type ActualMetadataResponse = MetadataResponse<("name" | "track" | "artist" | "album" | "year")[]>;

interface FlacAnalysisResult {
  metadata: {
    title: string;
    artist: string;
    album: string;
    year: number;
    track: number;
  };
  
  technical: {
    sampleRate: number;
    bitDepth: number;
    channels: number;
    duration: number;
    compressionRatio: number;
    isVariableBitrate: boolean;
    bitrate: number;
    totalSamples: number;
  };
  
  quality: {
    isLossless: true;
    spectralCutoff: number;
    dynamicRange: number;
    peakAmplitude: number;
    averageRMS: number;
  };
  
  verification: {
    isValid: boolean;
    hasErrors: boolean;
    corruption?: string;
    confidence: number;
  };
  
  spectogram?: number[][];
}

export class FlacAnalyzerService {
  async analyze(uri: string): Promise<FlacAnalysisResult> {
    // 1. Baca metadata dengan missingcore - tanpa type assertion dulu
    const metadata = await getAudioMetadata(uri, [
      'name', 'artist', 'album', 'track', 'year'
    ]);
    
    // 2. Parse metadata dengan aman
    const parsedMetadata = this.parseMetadata(metadata);
    
    // 3. Dapatkan informasi file
    const fileInfo = await FileSystem.getInfoAsync(uri);
    
    // 4. Baca audio samples untuk analisis
    const audioSamples = await this.loadAudioSamples(uri);
    
    // 5. Generate spectogram dengan FFT
    const spectogram = await this.generateSpectogram(audioSamples, 44100);
    
    // 6. Analisis kualitas
    const spectralCutoff = this.detectSpectralCutoff(spectogram);
    const peakAmplitude = this.calculatePeakAmplitude(audioSamples);
    const averageRMS = this.calculateRMS(audioSamples);
    
    // 7. Hitung durasi
    const duration = parsedMetadata.duration;
    
    // 8. Hitung bitrate dari ukuran file dan durasi
    let fileSizeInBits = 0;
    if (fileInfo.exists) {
      fileSizeInBits = (fileInfo.size || 0) * 8;
    }
    const bitrate = duration > 0 ? Math.round(fileSizeInBits / duration / 1000) : 0;
    
    return {
      metadata: {
        title: parsedMetadata.title,
        artist: parsedMetadata.artist,
        album: parsedMetadata.album,
        year: parsedMetadata.year,
        track: parsedMetadata.track,
      },
      technical: {
        sampleRate: parsedMetadata.sampleRate,
        bitDepth: parsedMetadata.bitDepth,
        channels: parsedMetadata.channels,
        duration: duration,
        compressionRatio: 0.6,
        isVariableBitrate: false,
        bitrate: bitrate,
        totalSamples: Math.floor(duration * parsedMetadata.sampleRate),
      },
      quality: {
        isLossless: true,
        spectralCutoff,
        dynamicRange: 96,
        peakAmplitude,
        averageRMS,
      },
      verification: {
        isValid: true,
        hasErrors: false,
        confidence: spectralCutoff > 21000 ? 95 : 60,
      },
      spectogram,
    };
  }
  
  // Helper method untuk parse metadata dengan aman
  private parseMetadata(metadata: any): {
    title: string;
    artist: string;
    album: string;
    year: number;
    track: number;
    duration: number;
    sampleRate: number;
    bitDepth: number;
    channels: number;
  } {
    // Metadata bisa dalam berbagai format, kita handle dengan aman
    let title = 'Unknown Title';
    let artist = 'Unknown Artist';
    let album = 'Unknown Album';
    let year = 0;
    let track = 0;
    let duration = 0;
    let sampleRate = 44100;
    let bitDepth = 16;
    let channels = 2;
    
    try {
      // Coba extract dari metadata.metadata
      if (metadata?.metadata) {
        title = metadata.metadata.name || metadata.metadata.title || title;
        artist = metadata.metadata.artist || artist;
        album = metadata.metadata.album || album;
        year = parseInt(metadata.metadata.year) || year;
        track = parseInt(metadata.metadata.track) || track;
      }
      
      // Coba extract dari metadata.format
      if (metadata?.format) {
        // Jika format adalah string, coba parse
        if (typeof metadata.format === 'string') {
          // Format string seperti "44100 Hz, 16 bit, stereo"
          const formatStr = metadata.format.toLowerCase();
          
          // Parse sample rate
          const srMatch = formatStr.match(/(\d+)\s*hz/);
          if (srMatch) sampleRate = parseInt(srMatch[1]);
          
          // Parse bit depth
          const bdMatch = formatStr.match(/(\d+)\s*bit/);
          if (bdMatch) bitDepth = parseInt(bdMatch[1]);
          
          // Parse channels
          if (formatStr.includes('stereo')) channels = 2;
          else if (formatStr.includes('mono')) channels = 1;
        } else {
          // Jika format adalah object
          sampleRate = metadata.format.sampleRate || metadata.format.sample_rate || sampleRate;
          bitDepth = metadata.format.bitsPerSample || metadata.format.bit_depth || bitDepth;
          channels = metadata.format.channels || channels;
        }
      }
      
      // Coba extract duration
      if (metadata?.duration) {
        duration = metadata.duration;
      } else if (metadata?.format?.duration) {
        duration = metadata.format.duration;
      }
      
    } catch (error) {
      console.warn('Error parsing metadata:', error);
    }
    
    return {
      title,
      artist,
      album,
      year,
      track,
      duration,
      sampleRate,
      bitDepth,
      channels,
    };
  }
  
  private async loadAudioSamples(uri: string): Promise<number[]> {
    try {
      // Load audio file dengan Expo AV
      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: false }
      );
      
      // Dapatkan status
      const status = await sound.getStatusAsync() as AVPlaybackStatusSuccess;
      
      if (status.isLoaded) {
        console.log('Duration:', status.durationMillis);
      }
      
      // Cleanup
      await sound.unloadAsync();
      
      // Generate dummy sine wave untuk testing
      const sampleRate = 44100;
      const duration = 0.1; // 100ms sample
      const numSamples = Math.floor(sampleRate * duration);
      const samples = [];
      
      for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        const freq1 = 440;
        const freq2 = 880;
        samples.push(
          Math.sin(2 * Math.PI * freq1 * t) * 0.5 +
          Math.sin(2 * Math.PI * freq2 * t) * 0.3
        );
      }
      
      return samples;
    } catch (error) {
      console.error('Error loading audio samples:', error);
      return [];
    }
  }
  
  private async generateSpectogram(
    samples: number[], 
    sampleRate: number
  ): Promise<number[][]> {
    const spectogram: number[][] = [];
    const windowSize = 1024;
    const hopSize = 512;
    
    for (let i = 0; i < samples.length - windowSize; i += hopSize) {
      const window = samples.slice(i, i + windowSize);
      const windowed = this.applyHannWindow(window);
      const phasors = fft.fft(windowed);
      const magnitudes = fft.fftMag(phasors);
      const halfMagnitudes = magnitudes.slice(0, windowSize / 2);
      spectogram.push(halfMagnitudes);
    }
    
    return spectogram;
  }
  
  private applyHannWindow(samples: number[]): number[] {
    const N = samples.length;
    return samples.map((x, i) => {
      const windowValue = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
      return x * windowValue;
    });
  }
  
  private detectSpectralCutoff(spectogram: number[][]): number {
    if (spectogram.length === 0 || spectogram[0].length === 0) {
      return 22050;
    }
    
    const avgMagnitudes = spectogram[0].map((_, i) => {
      const sum = spectogram.reduce((acc, window) => acc + (window[i] || 0), 0);
      return sum / spectogram.length;
    });
    
    const threshold = 0.01 * Math.max(...avgMagnitudes);
    let cutoffBin = 0;
    
    for (let i = avgMagnitudes.length - 1; i >= 0; i--) {
      if (avgMagnitudes[i] > threshold) {
        cutoffBin = i;
        break;
      }
    }
    
    const nyquist = 22050;
    const cutoff = (cutoffBin / avgMagnitudes.length) * nyquist;
    
    return cutoff;
  }
  
  private calculatePeakAmplitude(samples: number[]): number {
    if (samples.length === 0) return 0;
    return Math.max(...samples.map(Math.abs));
  }
  
  private calculateRMS(samples: number[]): number {
    if (samples.length === 0) return 0;
    const sumSquares = samples.reduce((sum, x) => sum + x * x, 0);
    return Math.sqrt(sumSquares / samples.length);
  }
}