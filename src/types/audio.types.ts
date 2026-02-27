// ─── Audio Types ────────────────────────────────────────────────────────────

export interface EQBand {
  id: number;
  frequency: number;   // Hz
  gain: number;        // dB, range -12 to +12
  q: number;           // bandwidth, 0.1 to 10
  type: 'lowshelf' | 'peaking' | 'highshelf';
}

export interface Preset {
  id: string;
  name: string;
  description: string;
  bands: EQBand[];
  isPremium: boolean;
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration: number;     // seconds
  uri: string;
  artwork?: string;
  fileSize?: number;    // bytes
  format?: string;      // 'FLAC' | 'MP3' | 'OGG' | 'AAC'
  bitrate?: number;     // kbps
  sampleRate?: number;  // Hz
}

// ─── Spatial Types ───────────────────────────────────────────────────────────

export interface SpatialPosition {
  x: number;  // left(-) to right(+), -5 to 5
  y: number;  // down(-) to up(+), -2 to 2
  z: number;  // back(-) to front(+), -5 to 5
}

export interface HRTFConfig {
  enabled: boolean;
  panningModel: 'HRTF' | 'equalpower';
  distanceModel: 'inverse' | 'linear' | 'exponential';
  refDistance: number;
  maxDistance: number;
  rolloffFactor: number;
}

// ─── Player Types ────────────────────────────────────────────────────────────

export type PlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'stopped';
export type RepeatMode = 'off' | 'track' | 'queue';
export type AppMode = 'clarity' | 'immersive';
