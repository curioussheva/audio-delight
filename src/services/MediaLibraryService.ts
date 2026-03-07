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
      first: 1000, // batasi untuk MVP
    });

    const songs: Song[] = media.assets.map((asset) => ({
      id: asset.id,
      title: asset.filename.replace(/\.[^/.]+$/, ''), // hapus extension
      artist: 'Unknown Artist', // MediaLibrary tidak menyediakan metadata artis
      duration: asset.duration || 0,
      uri: asset.uri,
      artwork: undefined,
    }));

    return songs;
  }
}

export default new MediaLibraryService();