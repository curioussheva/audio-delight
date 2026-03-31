import { NativeModules } from 'react-native';

const { MediaStoreModule } = NativeModules;

export interface NativeSong {
  id: string;
  uri: string;
  filename: string;
  title: string;
  artist: string;
  album: string;
  artworkUri: string;
  folder: string;
  codec: string;
  mimeType: string;
  duration: number;     // detik
  dateAdded: number;
  fileSize: number;
  year: number;
  trackNumber: number;
  discNumber: number;
}

export const MediaStore = {
  queryAudioFiles: (): Promise<NativeSong[]> =>
    MediaStoreModule.queryAudioFiles(),

  getAlbumArtUri: (albumId: string): Promise<string> =>
    MediaStoreModule.getAlbumArtUri(albumId),
};