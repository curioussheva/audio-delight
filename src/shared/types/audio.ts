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
  genre: string;
  folder: string;
  filename: string;
  uri: string;
  artwork?: string;
  duration: number; // Dalam DETIK

  codec: string;
  sampleRate: number;
  bitDepth?: number;
  bitrate?: number;
  isHiRes?: boolean; // ← optional, belum selalu ada di DB

  dateAdded: number;
  dateModified?: number;

  year?: number;
  trackNumber?: number;
  discNumber?: number;

  rating?: number;
  playCount: number;
  lastPlayed?: number;

  // DB fields
  isEnriched?: number; // ← tambah, 0 atau 1 dari SQLite
  lastSeenAt?: number; // ← tambah, dari migration
}

export interface Playlist {
  id: string;
  name: string;
  songs: string[]; // Array of Song IDs
  createdAt: number;
  updatedAt: number;
}

export interface PlaybackState {
  isPlaying: boolean;
  isLoading: boolean;
  position: number; // Dalam detik (float)
  duration: number;
  buffered: number;
  volume: number;
  rate: number; // Playback speed (0.5x - 2.0x)
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
