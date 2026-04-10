// ============================================================================
// DSP Types - Align dengan NativeDSPModule.kt
// ============================================================================

// Re-export DACInfo dari dac.ts untuk convenience
export type { DACInfo } from "./dac";

// ============================================================================
// Equalizer
// ============================================================================

export type EQBandType =
  | "peaking"
  | "lowshelf"
  | "highshelf"
  | "lowpass"
  | "highpass";

export interface EqualizerBand {
  frequency: number; // Hz (20 - 20000)
  gain: number; // dB (-12 to +12, or -15 to +15)
  q?: number; // Quality factor (0.1 - 10, default 1.0)
  type?: EQBandType; // Filter type
}

// NativeDSPModule expects: gains array untuk 10 bands
export interface EqualizerSettings {
  enabled: boolean;
  bands: EqualizerBand[]; // Typically 5 or 10 bands
  preset?: string; // "flat", "bass", "treble", etc.
}

// Preset definitions
export interface EQPreset {
  id: string;
  name: string;
  bands: EqualizerBand[];
  isCustom?: boolean;
  isDefault?: boolean;
}

// ============================================================================
// Other DSP Effects (dari NativeDSPModule.kt)
// ============================================================================

export interface BassBoostSettings {
  enabled: boolean;
  strength: number; // 0 - 1000 (Android BassBoost range)
}

export interface VirtualizerSettings {
  enabled: boolean;
  strength: number; // 0 - 1000 (Android Virtualizer range)
}

export interface ReverbSettings {
  enabled: boolean;
  preset: ReverbPreset;
}

export type ReverbPreset =
  | "none"
  | "smallroom"
  | "mediumroom"
  | "largeroom"
  | "mediumhall"
  | "largehall"
  | "plate";

// Mapping ke Android PresetReverb
export const REVERB_PRESET_MAP: Record<ReverbPreset, number> = {
  none: 0,
  smallroom: 1,
  mediumroom: 2,
  largeroom: 3,
  mediumhall: 4,
  largehall: 5,
  plate: 6,
};

// ============================================================================
// Complete DSP Pipeline Settings
// ============================================================================

export interface DSPSettings {
  // Master
  enabled: boolean;
  audioSessionId: number; // Target audio session

  // Effects
  equalizer: EqualizerSettings;
  bassBoost: BassBoostSettings;
  virtualizer: VirtualizerSettings;
  reverb: ReverbSettings;

  // Global
  loudnessCorrection?: boolean; // Loudness normalization
  channelBalance?: number; // -1.0 (left) to 1.0 (right), 0 = center
}

// ============================================================================
// DSP State (Runtime)
// ============================================================================

export interface DSPState {
  isInitialized: boolean;
  isProcessing: boolean;
  currentSessionId: number;

  // Effect status
  eqEnabled: boolean;
  bassEnabled: boolean;
  virtualizerEnabled: boolean;
  reverbEnabled: boolean;

  // Current values (untuk UI display)
  currentEQGains: number[]; // Real-time gain values
  currentBassStrength: number;

  // Errors
  lastError: string | null;
}

// ============================================================================
// DSP Pipeline Configuration
// ============================================================================

export type DSPMode = "off" | "minimal" | "full";

export interface DSPPipelineConfig {
  mode: DSPMode;

  // Mode-specific settings
  eqBandCount: number; // 5 or 10
  enableAdvancedEffects: boolean; // reverb, virtualizer

  // Quality
  quality: "low" | "normal" | "high";
  latencyProfile: "low" | "balanced" | "quality";
}

// ============================================================================
// Native Module Response Types
// ============================================================================

export interface DSPNativeResponse {
  success: boolean;
  error?: string;
  sessionId?: number;
}

// ============================================================================
// Utility Functions
// ============================================================================

export const createFlatEQ = (bandCount: number = 10): EqualizerBand[] => {
  const frequencies =
    bandCount === 5
      ? [60, 230, 910, 3600, 14000]
      : [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

  return frequencies.map((freq) => ({
    frequency: freq,
    gain: 0,
    q: 1.0,
    type: "peaking",
  }));
};

export const validateEQGain = (gain: number): number => {
  return Math.max(-12, Math.min(12, gain));
};

export const dbToLinear = (db: number): number => {
  return Math.pow(10, db / 20);
};

export const linearToDb = (linear: number): number => {
  return 20 * Math.log10(linear);
};

// Convert ReverbPreset to native value
export const getNativeReverbPreset = (preset: ReverbPreset): number => {
  return REVERB_PRESET_MAP[preset] ?? 0;
};

// Define FrequencyData locally atau import dari visualizer types

export interface FrequencyData {
  frequencies: Float32Array;
  sampleRate: number;
  bins: number;
  binWidth: number;
  binCount: number; // Total bins
  timestamp: number; // Capture timestamp
  maxFrequency: number;
}

// ... rest of file
