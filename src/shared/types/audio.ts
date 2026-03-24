export interface AudioFormat {
  codec: string;
  sampleRate: number;
  bitDepth?: number;
  bitrate?: number;
  channels?: number;
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  album: string;
  genre: string;         // Diwajibkan agar tidak null di Store
  folder: string;        // Penting untuk Folder View
  filename: string;      // Penting untuk fallback jika title kosong
  uri: string;
  artwork?: string;
  duration: number;      // Milidetik (ms) agar presisi
  
  // Audio Tech Info (Flattened agar mudah di-query di SQLite)
  codec: string;
  sampleRate: number;
  bitDepth?: number;
  bitrate?: number;
  isHiRes: boolean;

  // Timestamps
  dateAdded: number;
  dateModified?: number;

  // Metadata Tambahan
  year?: number;
  trackNumber?: number;
  discNumber?: number;
  
  // Stats
  rating?: number;       // 1-5
  playCount: number;     // Default 0
  lastPlayed?: number;
}

export interface Playlist {
  id: string;
  name: string;
  songs: string[];       // Array of Song IDs
  createdAt: number;
  updatedAt: number;
}

export interface PlaybackState {
  isPlaying: boolean;
  isLoading: boolean;
  position: number;      // Dalam detik (float)
  duration: number;
  buffered: number;
  volume: number;
  rate: number;          // Playback speed (0.5x - 2.0x)
}

export interface Queue {
  songs: Song[];
  currentIndex: number;
  shuffle: boolean;
  repeat: RepeatMode;
}

export type RepeatMode = "off" | "track" | "queue";

// Digunakan untuk fitur Analyzer & Bit Depth Verifier
export interface MusicAnalysisResult {
  id: string;
  technical: AudioFormat & {
    lossless: boolean;
  };
  quality: {
    spectralCutoff: number; // Untuk deteksi fake FLAC/Upscaled
    dynamicRange: number;
  };
  confidence: number;
  metadata: Partial<Song>;
}
 