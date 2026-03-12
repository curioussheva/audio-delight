// src/services/audio/MusicMetadataService.ts
import { getAudioMetadata } from '@missingcore/audio-metadata';
import * as FileSystem from 'expo-file-system';

export interface MusicAnalysisResult {
  metadata: {
    title: string;
    artist: string;
    album: string;
    year: number;
    track: number;
    genre?: string[];
  };
  technical: {
    format: string;
    size: number;
    duration: number;
    lossless: boolean;
    sampleRate: number;
    bitDepth: number;
    bitrate: number;
    channels: number;
    channelMode: string;
    encoder?: string;
  };
  quality: {
    spectralCutoff: number;
    dynamicRange: number;
    qualityScore: number;
    qualityBadge: '✅ LOSSLESS' | '⚠️ SUSPICIOUS' | '❌ FAKE' | '🎵 COMPRESSED';
  };
  replayGain?: {
    trackGain: number;
    trackPeak: number;
  };
}

export class MusicMetadataService {
  async analyze(uri: string): Promise<MusicAnalysisResult> {
    try {
      // 1. Baca metadata dengan audio-metadata
      const metadata = await getAudioMetadata(uri, [
        'name', 'artist', 'album', 'track', 'year'
      ]);
      
      // 2. Dapatkan informasi file
      const fileInfo = await FileSystem.getInfoAsync(uri);
      const fileSize = fileInfo.exists ? fileInfo.size : 0;
      
      // 3. Estimasi durasi (default 0, bisa diisi dari source lain)
      const duration = 0;
      
      // 4. Dapatkan format dari metadata
      // Gunakan type assertion atau konversi ke string
      const fileType = String(metadata.fileType || 'unknown').toLowerCase();
      
      // 5. Tentukan apakah lossless berdasarkan format
      // Gunakan pendekatan yang lebih aman dengan string
      const losslessFormats = ['flac', 'wav', 'alac', 'aiff', 'dsf', 'dff', 'ape', 'wv'];
      const isLossless = losslessFormats.includes(fileType);
      
      // Format lossy umum
      const lossyFormats = ['mp3', 'm4a', 'mp4', 'aac', 'ogg', 'opus'];
      const isLossy = lossyFormats.includes(fileType);
      
      // Sample rate default berdasarkan format
      let sampleRate = 44100;
      let bitDepth = 16;
      let bitrate = 0;
      
      if (isLossless) {
        // Untuk lossless, bitrate tinggi
        bitrate = 1411; // CD quality (1411 kbps)
        bitDepth = 16;
        sampleRate = 44100;
      } else if (isLossy) {
        // Untuk lossy, estimasi berdasarkan ukuran file
        if (fileSize > 0 && duration > 0) {
          bitrate = Math.round((fileSize * 8) / duration / 1000);
        } else {
          bitrate = 320; // default MP3 quality
        }
        bitDepth = 16;
        sampleRate = 44100;
      }
      
      return {
        metadata: {
          title: metadata.metadata.name || 'Unknown Title',
          artist: metadata.metadata.artist || 'Unknown Artist',
          album: metadata.metadata.album || 'Unknown Album',
          year: metadata.metadata.year || 0,
          track: metadata.metadata.track || 0,
          genre: [], // audio-metadata tidak menyediakan genre
        },
        technical: {
          format: fileType,
          size: fileSize,
          duration,
          lossless: isLossless,
          sampleRate,
          bitDepth,
          bitrate,
          channels: 2, // default stereo
          channelMode: 'stereo',
        },
        quality: {
          spectralCutoff: isLossless ? 22050 : 20000,
          dynamicRange: isLossless ? 96 : 80,
          qualityScore: isLossless ? 95 : 70,
          qualityBadge: isLossless ? '✅ LOSSLESS' : 
                        isLossy ? '🎵 COMPRESSED' : '⚠️ SUSPICIOUS',
        },
        replayGain: undefined,
      };
    } catch (error) {
      console.error('MusicMetadataService analyze failed:', error);
      // Return data dummy sebagai fallback
      return {
        metadata: {
          title: 'Unknown Title',
          artist: 'Unknown Artist',
          album: 'Unknown Album',
          year: 0,
          track: 0,
          genre: [],
        },
        technical: {
          format: 'unknown',
          size: 0,
          duration: 0,
          lossless: false,
          sampleRate: 44100,
          bitDepth: 16,
          bitrate: 0,
          channels: 2,
          channelMode: 'stereo',
        },
        quality: {
          spectralCutoff: 0,
          dynamicRange: 0,
          qualityScore: 0,
          qualityBadge: '⚠️ SUSPICIOUS',
        },
      };
    }
  }

  formatDuration(seconds: number): string {
    if (!seconds || seconds <= 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  formatBitrate(bitrate: number): string {
    if (!bitrate || bitrate <= 0) return 'Unknown';
    if (bitrate >= 1000) {
      return `${(bitrate / 1000).toFixed(1)} Mbps`;
    }
    return `${bitrate} kbps`;
  }
}

export default new MusicMetadataService();