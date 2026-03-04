import { useCallback } from 'react';
import * as MediaLibrary from 'expo-media-library';
import { Song, AudioFormat } from '@/types/audio';
import { useAudioStore } from '@store/audioStore';

const getAudioFormat = (filename: string): AudioFormat['codec'] => {
  const ext = filename.split('.').pop()?.toLowerCase();
  const codecMap: Record<string, AudioFormat['codec']> = {
    'mp3': 'mp3',
    'm4a': 'm4a',
    'aac': 'aac',
    'flac': 'flac',
    'wav': 'wav',
    'ogg': 'ogg',
  };
  return codecMap[ext || ''] || 'mp3';
};

export const useMusicLibrary = () => {
  const addSongs = useAudioStore((state) => state.addSongs);

  const scanLibrary = useCallback(async () => {
    try {
      // Get all audio files
      const media = await MediaLibrary.getAssetsAsync({
        mediaType: MediaLibrary.MediaType.audio,
        first: 10000, // Adjust based on library size
      });

      const songs: Song[] = await Promise.all(
        media.assets.map(async (asset) => {
          // Get detailed info
          const assetInfo = await MediaLibrary.getAssetInfoAsync(asset);
          
          return {
            id: asset.id,
            uri: asset.uri,
            title: asset.filename.replace(/\.[^/.]+$/, '') || 'Unknown Title',
            artist: 'Unknown Artist', // Will parse from metadata later
            album: 'Unknown Album',
            duration: asset.duration,
            format: {
              codec: getAudioFormat(asset.filename),
              sampleRate: 44100, // Default, will detect later
              channels: 2,
            },
            dateAdded: asset.creationTime,
          };
        })
      );

      addSongs(songs);
      return songs.length;
    } catch (error) {
      console.error('Error scanning library:', error);
      return 0;
    }
  }, [addSongs]);

  return { scanLibrary };
};
