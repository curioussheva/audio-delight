// ============================================================================
// Visualizer Types - Align dengan NativeVisualizerBridge.kt
// ============================================================================

// Re-export dari dsp.ts untuk convenience (circular dependency check)
// atau define ulang jika perlu independence

// ============================================================================
// Frequency Data (dari native FFT)
// ============================================================================
import type { FrequencyData } from "./dsp";
{
  /*
export interface FrequencyData {
  frequencies: Float32Array;  // 128 bins, 0.0-1.0 (log-scaled)
  sampleRate: number;         // Hz (44100, 48000, etc.)
  bins: number;             // 128 (dari native)
  timestamp: number;        // Frame timestamp
}
*/
}
// Extended dengan metadata
export interface FrequencyDataWithMeta extends FrequencyData {
  binWidth: number; // Hz per bin (~172Hz @ 44.1k)
  maxFrequency: number; // Nyquist (sampleRate / 2)
  amplitudeRange: {
    min: number;
    max: number;
    average: number;
  };
}

// ============================================================================
// Frequency Bands (untuk UI display)
// ============================================================================

export interface FrequencyBand {
  name: string;
  range: [number, number]; // [startHz, endHz]
  amplitude: number; // 0.0-1.0 (averaged)
  peak: number; // Peak dalam band ini
}

export interface FrequencyBands {
  subBass: FrequencyBand; // 20-60 Hz
  bass: FrequencyBand; // 60-250 Hz
  lowMid: FrequencyBand; // 250-500 Hz
  mid: FrequencyBand; // 500-2000 Hz
  highMid: FrequencyBand; // 2000-4000 Hz
  presence: FrequencyBand; // 4000-6000 Hz
  brilliance: FrequencyBand; // 6000-20000 Hz
}

// ============================================================================
// Visualizer Configuration
// ============================================================================

export type VisualizerMode =
  | "bars"
  | "wave"
  | "circle"
  | "spectrogram"
  | "particles";

export interface VisualizerConfig {
  mode: VisualizerMode;

  // Common
  barCount?: number; // 16, 32, 48, 64, 128
  color?: string;
  sensitivity?: number; // 0.5 - 3.0
  smoothing?: number; // 0.0 - 1.0 (EMA factor)

  // Mode-specific
  showCenterArt?: boolean; // Untuk mode "circle"
  mirrorWave?: boolean; // Untuk mode "wave"
  particleCount?: number; // Untuk mode "particles"

  // Performance
  fps?: number; // Target FPS (30, 60)
  downsample?: number; // Skip every N frames
}

// ============================================================================
// Visualizer State
// ============================================================================

export interface VisualizerState {
  isActive: boolean;
  isPaused: boolean;
  isInitialized: boolean;

  // Session
  sessionId: number;

  // Data
  currentData: FrequencyData | null;
  history: FrequencyData[]; // Ring buffer untuk spectrogram

  // Performance
  actualFps: number;
  droppedFrames: number;

  // Error
  error: string | null;
}

// ============================================================================
// Visualizer Events
// ============================================================================

export type VisualizerEventType =
  | "started"
  | "stopped"
  | "paused"
  | "resumed"
  | "data"
  | "error";

export interface VisualizerEvent {
  type: VisualizerEventType;
  timestamp: number;
  data?: FrequencyData;
  error?: string;
}

// ============================================================================
// Analysis Result (untuk static analysis, bukan live)
// ============================================================================

export interface VisualizerAnalysisResult {
  dominantFrequency: number; // Hz, peak frequency
  bandwidth: number; // Hz, frequency spread
  crestFactor: number; // Peak / RMS ratio
  zeroCrossingRate: number; // Transient indicator

  // Classification
  isBassHeavy: boolean;
  isTrebleHeavy: boolean;
  dynamicRange: number; // dB
}
