export type BandType = "peaking" | "lowshelf" | "highshelf";

/**
 * Struktur data untuk satu pita frekuensi (Band)
 */
export interface EqualizerBand {
  id: number; // Indeks 0-9 untuk 10-band
  frequency: number; // Hz (32, 64, dst)
  gain: number; // -12.0 s/d 12.0 dB
  q: number; // Quality factor (lebar pita filter)
  type: BandType; // Karakteristik filter
}

/**
 * Struktur data untuk satu Preset (Bawaan atau Custom)
 */
export interface Preset {
  id: string;
  name: string;
  description?: string;
  isPremium?: boolean;
  isCustom?: boolean;
  bands: EqualizerBand[];
  // Parameter opsional untuk efek tambahan dalam satu preset
  bassBoost?: number;
  virtualizer?: number;
  reverb?: number;
}

/**
 * Definisi State dan Action untuk Zustand Store
 */
export interface EqualizerStore {
  // State
  bands: EqualizerBand[];
  activePresetId: string;
  isEQEnabled: boolean;
  customPresets: Preset[];
  bassStrength: number;
  virtualizerLevel: number;
  reverbPreset: number;
  audioSessionId: number;
  isInitialized: boolean;
  initialize: () => void | Promise<void>;

  // Actions (Fungsi Pengubah State)
  setAudioSessionId: (id: number) => void;
  setEQEnabled: (enabled: boolean) => Promise<void>;
  toggleEQ: () => Promise<void>; // Tambahkan ini
  setBassBoost: (strength: number) => Promise<void>;
  setVirtualizer: (level: number) => Promise<void>;
  setReverb: (preset: number) => Promise<void>;

  applyPreset: (presetId: string) => void;
  setBandGain: (index: number, gain: number) => void;
  saveCustomPreset: (name: string) => void;
  deleteCustomPreset: (id: string) => void;
  repeatPreset?: "off" | "all" | "track";
}

/**
 * State Ringkas untuk dikonsumsi Hook useEqualizer
 */
export interface EqualizerState {
  currentBands: EqualizerBand[];
  bassStrength: number;
  virtualizerLevel: number;
  reverbPreset: number;
  activePresetId: string;
  isDSPDisabled: boolean; // Flag untuk proteksi Bit-Perfect
}

export interface NativeDSPInterface {
  setEqualizer(
    band: number,
    level: number,
    audioSessionId: number,
  ): Promise<boolean>;
  setFullEqualizer(gains: number[], audioSessionId: number): Promise<boolean>;
  setBassBoost(strength: number, audioSessionId: number): Promise<boolean>;
  setVirtualizer(strength: number, sessionId: number): Promise<boolean>;
  setReverbPreset(preset: number, audioSessionId: number): Promise<boolean>;
  releaseAllFX(): Promise<boolean>;
  toggleExclusiveMode(enabled: boolean): Promise<boolean>;
}
