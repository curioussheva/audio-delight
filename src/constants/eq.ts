import { EQBand } from '../types/audio.types';

// 10 standard audiophile frequencies
export const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;

export const EQ_BAND_TYPES: EQBand['type'][] = [
  'lowshelf',  // 32Hz
  'peaking',   // 64Hz
  'peaking',   // 125Hz
  'peaking',   // 250Hz
  'peaking',   // 500Hz
  'peaking',   // 1kHz
  'peaking',   // 2kHz
  'peaking',   // 4kHz
  'peaking',   // 8kHz
  'highshelf', // 16kHz
];

export const EQ_DISPLAY_LABELS = ['32', '64', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'];

export const DEFAULT_Q = 1.41; // √2, standard for 10-band EQ
export const MAX_GAIN = 12;    // dB
export const MIN_GAIN = -12;   // dB

export const DEFAULT_BANDS: EQBand[] = EQ_FREQUENCIES.map((freq, i) => ({
  id: i,
  frequency: freq,
  gain: 0,
  q: DEFAULT_Q,
  type: EQ_BAND_TYPES[i],
}));

export const AUDIO_CONFIG = {
  SAMPLE_RATE: 44100,
  FFT_SIZE: 2048,
  SMOOTHING: 0.8,         // AnalyserNode smoothingTimeConstant
  LATENCY_HINT: 'interactive' as AudioContextLatencyCategory,
  VISUALIZER_BINS: 64,    // Downsample FFT to this for performance
  GYRO_UPDATE_MS: 50,     // 20fps for head-tracking
};
