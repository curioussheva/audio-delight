// ============================================================================
// Audio Format (Technical Specs)
// ============================================================================

export interface AudioFormat {
  codec: string;        // FLAC, MP3, AAC, etc.
  sampleRate: number;   // Hz (44100, 48000, 96000, etc.)
  bitDepth?: number;    // 16, 24, 32 (optional untuk lossy)
  bitrate?: number;     // kbps (file bitrate, bukan uncompressed)
  channels?: number;    // 1, 2, or more
  mimeType?: string;    // audio/flac, audio/mpeg, etc.
}

// ============================================================================
// Main Song Entity (Align dengan DB Schema)
// ============================================================================

export interface Song {
  // Identifiers
  id: string;           // PRIMARY KEY (MediaStore ID atau UUID)
  uri: string;          // UNIQUE NOT NULL (content:// atau file://)
  originalUri?: string; // Backup original path

  // Metadata Dasar (ID3 Tags)
  title: string;
  artist: string;
  album: string;
  genre: string;
  folder: string;       // Parent directory name
  filename: string;     // File name with extension

  // Extended Metadata (ID3 Tags)
  composer?: string;
  lyricist?: string;
  conductor?: string;
  publisher?: string;
  label?: string;
  language?: string;
  mood?: string;

  // Media & Artwork
  artwork?: string;          // URI ke artwork (content:// atau local path)
  albumArtwork?: string;     // Separate album art
  artistImageUrl?: string;   // Dari MusicBrainz / Cover Art Archive
  artist_image_url?: string;

  // Duration
  duration: number;          // Dalam DETIK (integer, bukan float)

  // Audio Technical (dari AudioFormat)
  codec: string;
  sampleRate: number;
  bitDepth?: number;
  bitrate?: number;          // kbps, 0 jika unknown
  fileSize?: number;         // Dalam bytes
  channels?: number;         // 1 (mono), 2 (stereo), 5.1, etc.

  // Track Information
  trackNumber?: number;      // Track number in album (0 jika unknown)
  trackTotal?: number;       // Total tracks in album
  discNumber?: number;       // Disc number (0 jika unknown)
  discTotal?: number;        // Total discs
  year?: number;             // Release year (0 jika unknown)

  // Advanced Audio Features
  tempo?: number;            // BPM (Beats Per Minute)
  keyOfSong?: string;        // Musical key (C, Dm, G#m, etc.)

  // Lyrics
  lyrics?: string;           // Plain text lyrics
  lyricsSynced?: string;     // LRC format synchronized lyrics

  // Enrichment (dari MusicBrainz + Wikipedia)
  artistBio?: string;        // Biography dari Wikipedia via MusicBrainz
  isEnriched: boolean;       // DB: INTEGER 0/1
  lastEnrichedAt?: number;   // Timestamp enrichment terakhir

  // Database Status Fields
  lastSeenAt: number;        // Timestamp scan terakhir
  dateAdded: number;         // Timestamp pertama kali ditambahkan
  dateModified?: number;     // Timestamp file terakhir dimodifikasi

  // User Data
  playCount: number;         // DEFAULT 0
  isFavorite: boolean;       // DB: INTEGER 0/1
  lastPlayed?: number;       // Timestamp last playback
  rating?: number;           // 0-5 stars (0 = unrated)

  // Additional Flags
  compilation?: boolean;     // Is part of compilation album
  explicit?: boolean;        // Explicit content flag

  // Computed (tidak di DB, di-calculate saat runtime)
  isHiRes?: boolean;         // Computed: sampleRate > 48000 || bitDepth > 16
}

// ============================================================================
// Playlist (Align dengan DB Schema)
// ============================================================================

export interface Playlist {
  id: string;
  name: string;
  type?: "user" | "system" | "smart";
  artwork?: string;

  songIds: string[];
  songCount?: number;

  createdAt?: number;
  updatedAt?: number;
}

// ============================================================================
// Playback State (Runtime State)
// ============================================================================

export type RepeatMode = "off" | "track" | "queue";
export type ShuffleMode = "off" | "on";

export interface PlaybackState {
  isPlaying: boolean;
  isLoading: boolean;
  isBuffering: boolean;

  position: number;
  duration: number;
  buffered: number;

  volume: number;
  rate: number;

  shuffle: ShuffleMode;
  repeat: RepeatMode;

  audioSessionId?: number;
  isExclusiveMode?: boolean;
  currentSampleRate?: number;
  currentBitDepth?: number;
}

// ============================================================================
// Playback Queue (Runtime)
// ============================================================================

export interface PlaybackQueue {
  songs: Song[];
  originalSongs?: Song[];

  currentIndex: number;
  currentSong?: Song;

  history: number[];
}

// ============================================================================
// Music Analysis Result (Align dengan analyzer.ts)
// ============================================================================

export type AnalysisMethod = "heuristic" | "metadata" | "fft";

export interface MusicAnalysisResult {
  id: string;

  technical: AudioFormat & {
    lossless: boolean;
    compressionRatio?: number;
  };

  quality: {
    spectralCutoff: number;
    dynamicRange: number;
    peakFrequency: number;
  };

  confidence: number;
  analysisMethod: AnalysisMethod;
  warnings: string[];

  metadata: Partial<Song>;
  analyzedAt: number;

  bitDepthAnalysis?: {
    declared: number;
    estimated: number;
    isFake: boolean;
    confidence: number;
    paddingRatio: number;
  };
}

// ============================================================================
// Enrichment Status (untuk BackgroundScanTask)
// ============================================================================

export interface EnrichmentStatus {
  isEnriching: boolean;
  enriched: number;
  enrichTotal: number;
  currentSong?: string;
}

// ============================================================================
// Scan Status (untuk LibraryTabBar)
// ============================================================================

export interface ScanStatus {
  isScanning: boolean;
  isEnriching: boolean;
  scanned: number;
  total: number;
  enriched: number;
  enrichTotal: number;
}

// ============================================================================
// Library State (Zustand Store)
// ============================================================================

export type LibraryTab =
  | "song"
  | "album"
  | "artist"
  | "genre"
  | "folder"
  | "playlist"
  | "filetype";

export interface LibraryState {
  songs: Song[];
  playlists: Playlist[];

  activeTab: LibraryTab;
  searchQuery: string;

  scanStatus: ScanStatus;

  selectedSongs: string[];

  filterBy: "all" | "lossless" | "lossy" | "hi-res";
  sortBy:
    | "title-asc"
    | "title-desc"
    | "artist-asc"
    | "date-added"
    | "play-count";
}

// ============================================================================
// Helper Types untuk API Responses
// ============================================================================

export type SongWithArtwork = Song & {
  artworkData?: Uint8Array;
};

export interface PaginatedSongs {
  songs: Song[];
  hasMore: boolean;
  nextCursor?: string;
  total: number;
}

// ============================================================================
// Utility Functions
// ============================================================================

export const isHiRes = (song: Song): boolean => {
  return (
    song.sampleRate > 48000 ||
    (song.bitDepth !== undefined && song.bitDepth > 16)
  );
};

export const isLossless = (song: Song): boolean => {
  const losslessCodecs = [
    "FLAC", "ALAC", "WAV", "AIFF", "APE", "DSD", "DSF", "DFF",
  ];
  return losslessCodecs.includes(song.codec.toUpperCase());
};

export const formatDuration = (seconds: number): string => {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
};

export const formatBitrate = (bitrate?: number): string => {
  if (!bitrate || bitrate === 0) return "VBR";
  return `${bitrate} kbps`;
};

// ============================================================================
// Converter Functions (DB <-> TypeScript)
// ============================================================================

export const dbRowToSong = (row: any): Song => ({
  ...row,
  isEnriched: row.isEnriched === 1,
  isFavorite: row.isFavorite === 1,
  compilation: row.compilation === 1,
  explicit: row.explicit === 1,
  isHiRes: isHiRes({ ...row, isEnriched: false, isFavorite: false }),
});

export const songToDbRow = (song: Song): any => ({
  ...song,
  isEnriched: song.isEnriched ? 1 : 0,
  isFavorite: song.isFavorite ? 1 : 0,
  compilation: song.compilation ? 1 : 0,
  explicit: song.explicit ? 1 : 0,
});
 