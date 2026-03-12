import * as FileSystem from 'expo-file-system';
import { parseBlob, IAudioMetadata, ICommonTagsResult, IFormat } from 'music-metadata';

export interface MusicAnalysisResult {
  // Metadata dasar
  metadata: {
    title: string;
    artist: string;
    album: string;
    year: number;
    track: { no: number; of: number };
    genre: string[];
    composer: string[];
    lyrics: string;
    picture?: {
      format: string;
      data: string; // base64
    };
  };

  // Informasi teknis format
  technical: {
    format: string; // 'FLAC', 'MP3', 'M4A', dll
    codec: string;
    sampleRate: number;
    bitDepth: number;
    bitrate: number; // kbps
    duration: number; // detik
    channels: number;
    channelMode: string; // 'stereo', 'mono', 'joint-stereo'
    lossless: boolean;
    numberOfSamples: number;
    compressionRatio?: number;
    encoder?: string;
    container?: string;
  };

  // Analisis kualitas
  quality: {
    spectralCutoff: number; // Hz
    dynamicRange: number; // dB
    peakAmplitude: number;
    rmsAverage: number;
    qualityScore: number; // 0-100
    qualityBadge: '✅ LOSSLESS' | '⚠️ SUSPICIOUS' | '❌ FAKE' | '🎵 COMPRESSED';
  };

  // ReplayGain (jika ada)
  replayGain?: {
    trackGain: number; // dB
    trackPeak: number;
    albumGain: number;
    albumPeak: number;
  };

  // MusicBrainz IDs (untuk lookup)
  musicBrainz?: {
    trackId?: string;
    albumId?: string;
    artistId?: string;
  };
}

export class MusicMetadataService {
  private async fileToBlob(uri: string): Promise<Blob> {
    // Baca file sebagai base64
    const base64 = await FileSystem.readAsStringAsync(uri, {
  encoding: 'base64',  // ← gunakan string, bukan FileSystem.EncodingType.Base64
});
    
    // Konversi base64 ke Blob
    const byteCharacters = atob(base64);
    const byteArrays = [];
    
    for (let offset = 0; offset < byteCharacters.length; offset += 512) {
      const slice = byteCharacters.slice(offset, offset + 512);
      const byteNumbers = new Array(slice.length);
      
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }
      
      const byteArray = new Uint8Array(byteNumbers);
      byteArrays.push(byteArray);
    }
    
    return new Blob(byteArrays, { type: 'audio/flac' });
  }

  private detectSpectralCutoff(format: IFormat, common: ICommonTagsResult): number {
    // Estimasi cutoff frequency berdasarkan format dan bitrate
    if (format.lossless) {
      return 22050; // FLAC asli bisa sampai 22.05kHz (untuk 44.1kHz)
    }
    
    // Untuk MP3/AAC, cutoff tergantung bitrate
    const bitrate = format.bitrate || 128000;
    if (bitrate >= 320000) return 20000; // MP3 320kbps
    if (bitrate >= 192000) return 18000; // MP3 192kbps
    if (bitrate >= 128000) return 16000; // MP3 128kbps
    return 14000; // MP3 < 128kbps
  }

  private calculateDynamicRange(format: IFormat): number {
    // Estimasi dynamic range berdasarkan bit depth
    if (format.lossless) {
      return 96 + (format.bitsPerSample ? (format.bitsPerSample - 16) * 6 : 0);
    }
    // Untuk lossy, estimasi berdasarkan bitrate
    const bitrate = (format.bitrate || 128000) / 1000;
    return Math.min(80, 60 + bitrate * 0.1);
  }

  private getQualityBadge(
    format: IFormat,
    cutoff: number,
    dynamicRange: number
  ): MusicAnalysisResult['quality']['qualityBadge'] {
    if (format.lossless) {
      // FLAC, ALAC, dll
      if (cutoff > 21000 && dynamicRange > 90) {
        return '✅ LOSSLESS';
      }
      return '⚠️ SUSPICIOUS';
    }
    
    // MP3, AAC, dll
    if (format.bitrate && format.bitrate >= 320000) {
      return '🎵 COMPRESSED';
    }
    
    return '❌ FAKE';
  }

  async analyze(uri: string): Promise<MusicAnalysisResult> {
    try {
      // Konversi file ke Blob
      const blob = await this.fileToBlob(uri);
      
      // Parse metadata dengan music-metadata
      const metadata = await parseBlob(blob, {
        duration: true,
        skipCovers: false,
        includeChapters: true,
      });
      
      const { format, common } = metadata;
      
      // Konversi gambar ke base64 jika ada
      let pictureBase64: string | undefined;
      if (common.picture && common.picture.length > 0) {
        const picture = common.picture[0];
        pictureBase64 = `data:${picture.format};base64,${picture.data.toString('base64')}`;
      }

      // Analisis spektral
      const spectralCutoff = this.detectSpectralCutoff(format, common);
      const dynamicRange = this.calculateDynamicRange(format);
      
      // Hitung quality score
      let qualityScore = 100;
      if (!format.lossless) {
        const bitrate = (format.bitrate || 128000) / 1000;
        qualityScore = Math.min(100, (bitrate / 320) * 100);
      } else {
        qualityScore = 95; // lossless default
        if (format.bitsPerSample && format.bitsPerSample > 16) {
          qualityScore += 5; // bonus untuk hi-res
        }
      }

      // Kompresi ratio untuk lossless
      let compressionRatio: number | undefined;
      if (format.lossless && format.numberOfSamples && format.bitsPerSample) {
        const uncompressedSize = format.numberOfSamples && format.bitsPerSample && format.numberOfChannels
  ? format.numberOfSamples * format.bitsPerSample * format.numberOfChannels / 8
  : 0;
      }

      return {
        metadata: {
          title: common.title || 'Unknown Title',
          artist: common.artist || common.artists?.[0] || 'Unknown Artist',
          album: common.album || 'Unknown Album',
          year: common.year || 0,
          track: {
            no: common.track?.no || 0,
            of: common.track?.of || 0,
          },
          genre: common.genre || [],
          composer: common.composer || [],
          lyrics: common.lyrics?.[0]?.text || '',
          picture: pictureBase64 ? {
            format: common.picture![0].format,
            data: pictureBase64,
          } : undefined,
        },
        
        technical: {
          format: format.container || format.codec || 'Unknown',
          codec: format.codec || 'Unknown',
          sampleRate: format.sampleRate || 44100,
          bitDepth: format.bitsPerSample || 16,
          bitrate: Math.round((format.bitrate || 0) / 1000),
          duration: format.duration || 0,
          channels: format.numberOfChannels || 2,
          channelMode: format.tool || 'stereo',
          lossless: format.lossless || false,
          numberOfSamples: format.numberOfSamples || 0,
          compressionRatio,
          encoder: format.encoder || undefined,
          container: format.container || undefined,
        },
        
        quality: {
          spectralCutoff,
          dynamicRange,
          peakAmplitude: Math.abs(common.peak?.data?.[0] || 0.9),
          rmsAverage: 0.3, // memerlukan analisis sample
          qualityScore,
          qualityBadge: this.getQualityBadge(format, spectralCutoff, dynamicRange),
        },
        
        replayGain: common.replaygain_track_gain ? {
          trackGain: common.replaygain_track_gain,
          trackPeak: common.replaygain_track_peak || 1,
          albumGain: common.replaygain_album_gain || 0,
          albumPeak: common.replaygain_album_peak || 1,
        } : undefined,
        
        musicBrainz: {
          trackId: common.musicbrainz_trackid,
          albumId: common.musicbrainz_albumid,
          artistId: common.musicbrainz_artistid?.[0],
        },
      };
    } catch (error) {
      console.error('Music metadata analysis failed:', error);
      throw error;
    }
  }

  async analyzeBatch(uris: string[]): Promise<MusicAnalysisResult[]> {
    const results: MusicAnalysisResult[] = [];
    
    for (const uri of uris) {
      try {
        const result = await this.analyze(uri);
        results.push(result);
      } catch (error) {
        console.error(`Failed to analyze ${uri}:`, error);
        // Tetap push null untuk tracking
        results.push(null as any);
      }
    }
    
    return results;
  }

  formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  formatBitrate(bitrate: number): string {
    if (bitrate >= 1000) {
      return `${(bitrate / 1000).toFixed(1)} Mbps`;
    }
    return `${bitrate} kbps`;
  }
}

export default new MusicMetadataService();
