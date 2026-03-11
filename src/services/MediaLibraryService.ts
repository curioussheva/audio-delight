import * as MediaLibrary from 'expo-media-library';
import { Song } from '@/types/audio';

class MediaLibraryService {
  async requestPermissions(): Promise<boolean> {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    return status === 'granted';
  }

  async getAudioFiles(): Promise<Song[]> {
    const hasPermission = await this.requestPermissions();
    if (!hasPermission) return [];

    const media = await MediaLibrary.getAssetsAsync({
      mediaType: 'audio',
      first: 1000,
    });

    const songs: Song[] = media.assets.map((asset) => ({
      id: asset.id,
      title: asset.filename.replace(/\.[^/.]+$/, ''),
      artist: 'Unknown Artist',
      album: '',
      duration: asset.duration || 0,
      uri: asset.uri,
      artwork: undefined,
      format: {
        codec: 'mp3',
        sampleRate: 44100,
        bitDepth: 16,
        channels: 2,
      },
      dateAdded: Date.now(),
    }));

    return songs;
  }
}

export default new MediaLibraryService();