// shared/types exports
// Central export untuk semua types

// Audio (songs, playlists, playback)
export * from "./audio";

// DAC / Hardware
export * from "./dac";

// DSP (Equalizer, effects)
export * from "./dsp";

// Visualizer (FFT, spectrum)
export * from "./visualizer";

// Cross-cutting types
export interface AppState {
  // Global app state
  isReady: boolean;
  isPremium: boolean;

  // Audio pipeline
  currentSong: import("./audio").Song | null;
  playbackState: import("./audio").PlaybackState;
  dacState: import("./dac").DACState;
  dspState: import("./dsp").DSPState;
  visualizerState: import("./visualizer").VisualizerState;
}
