export interface AudioFormat {
  codec: string;
  sampleRate: number;
  bitDepth?: number;
  bitrate?: number;
  channels?: number;
}

// src/shared/types/audio.ts

export interface Song {
  // Identitas & Path
  id: string;
  uri: string;
  title: string;
  artist: string;
  album: string;

  // Metadata Tambahan
  genre?: string;
  folder?: string;
  filename?: string;
  artwork?: string;
  duration: number;

  // Audio Tech
  codec?: string;
  sampleRate?: number;
  bitDepth?: number;
  bitrate?: number;
  channels?: number;
  fileSize?: number;
  isHiRes?: boolean;

  // Info Album/Artis
  albumId?: number;
  albumArtist?: string;
  compilation?: boolean;
  explicit?: boolean;
  label?: string;
  publisher?: string;
  year?: number;
  trackNumber?: number;
  discNumber?: number;

  // Statistik & User Data
  playCount?: number;
  rating?: number;
  isFavorite?: boolean;
  lastPlayed?: number;

  // Enrichment
  isEnriched?: boolean;
  lastEnrichedAt?: number;
  lastSeenAt?: number;
  mood?: string;
  tempo?: number;
  artistImageUrl?: string;
  artistBio?: string;

  // Timestamp
  dateAdded?: number;
  dateModified?: number;
}

export function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
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

// Tambahkan interface untuk BitDepthAnalysis
export interface BitDepthAnalysis {
  declaredDepth: number;
  realDepth: number;
  isUpscaled: boolean;
}
