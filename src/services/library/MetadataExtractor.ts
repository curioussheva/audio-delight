import { NativeModules } from 'react-native';
import { Song } from '@/types/audio';

const { NativeMetadataModule } = NativeModules;

class MetadataExtractor {
  async extract(uri: string): Promise<Partial<Song>> {
    try {
      // Mengambil data teknis dari Native (Kotlin/C++)
      const raw = await NativeMetadataModule.getAdvancedMetadata(uri);
      
      return {
        id: uri, // Gunakan path sebagai ID sementara atau hash
        title: raw.title || uri.split('/').pop()?.split('.')[0],
        artist: raw.artist || 'Unknown Artist',
        album: raw.album || 'Unknown Album',
        duration: raw.duration || 0,
        uri: uri,
        format: {
          codec: uri.split('.').pop()?.toLowerCase() || 'other',
          sampleRate: raw.sampleRate || 44100,
          bitDepth: raw.bitDepth || 16,
          bitrate: raw.bitrate ? Math.round(raw.bitrate / 1000) : undefined,
        },
        dateAdded: Date.now(),
      };
    } catch (e) {
      console.error(`[MetadataExtractor] Fail: ${uri}`, e);
      return {};
    }
  }
}

export default new MetadataExtractor();
