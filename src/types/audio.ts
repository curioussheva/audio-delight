export interface Song {
  id: string;
  uri: string;
  title: string;
  artist: string;
  album: string;
  artwork?: string;
  duration: number; // in seconds
  format: AudioFormat;
  dateAdded: number;
}

export interface AudioFormat {
  codec: 'mp3' | 'wav' | 'aac' | 'm4a' | 'ogg' | 'flac' | 'dsd' | 'other';
  sampleRate: number; // 44100, 48000, 96000, 192000
  bitDepth?: number; // 16, 24, 32
  bitrate?: number; // kbps
  channels: number;
}

export interface Playlist {
  id: string;
  name: string;
  songs: string[]; // array of song IDs
  createdAt: number;
  updatedAt: number;
}

export interface PlaybackState {
  isPlaying: boolean;
  isLoading: boolean;
  position: number; // current position in seconds
  duration: number;
  buffered: number;
  volume: number;
  rate: number; // playback speed
}

export interface Queue {
  songs: Song[];
  currentIndex: number;
  shuffle: boolean;
  repeat: 'off' | 'track' | 'queue';
}

export type RepeatMode = 'off' | 'track' | 'queue';
