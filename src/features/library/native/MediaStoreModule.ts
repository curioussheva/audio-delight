import MediaStoreModule from "../../../specs/MediaStoreModule";


export interface NativeSong {
  id: string;
  uri: string;
  filename: string;
  title: string;
  artist: string;
  album: string;
  albumId: number;
  artwork: string;
  artworkUri: string;
  folder: string;
  genre: string;
  codec: string;
  mimeType: string;
  duration: number;
  dateAdded: number;
  fileSize: number;
  year: number;
  trackNumber: number;
  discNumber: number;
  // ✅ TAMBAH: Technical specs dari native
  bitrate: number;
  sampleRate: number;
  bitDepth: number;
  isEnriched: boolean;
  isFavorite: boolean;
  playCount: number;
}

export interface MediaStoreError {
  code: string;
  message: string;
}

export const MediaStore = {
  /**
   * Query semua audio files dari MediaStore Android
   * Mengembalikan array NativeSong dengan metadata lengkap
   */
  queryAudioFiles: async (): Promise<NativeSong[]> => {
    try {
      const result = await MediaStoreModule.queryAudioFiles();
      return result as NativeSong[];
    } catch (error: any) {
      console.error("[MediaStore] Query failed:", error?.message || error);
      return [];
    }
  },

  /**
   * Get album art URI by album ID
   */
  getAlbumArtUri: async (albumId: string): Promise<string | null> => {
    try {
      const uri = await MediaStoreModule.getAlbumArtUri(albumId);
      return uri;
    } catch (error) {
      console.error("[MediaStore] Get album art failed:", error);
      return null;
    }
  },

  /**
   * Get single song info by URI
   */
  getSongInfo: async (uri: string): Promise<NativeSong | null> => {
    try {
      const songs = await MediaStoreModule.queryAudioFiles();
      return songs.find((song: NativeSong) => song.uri === uri) || null;
    } catch (error) {
      console.error("[MediaStore] Get song info failed:", error);
      return null;
    }
  },
};

export default MediaStore;
