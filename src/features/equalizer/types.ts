// src/features/equalizer/types.ts

export type BandType = "peaking" | "lowshelf" | "highshelf";

/**
 * Struktur data untuk satu pita frekuensi (Band)
 */
export interface EqualizerBand {
  id: number;
  frequency: number;
  gain: number;
  q: number;
  type: BandType;
}

/**
 * Struktur data untuk satu Preset
 */
export interface Preset {
  id: string;
  name: string;
  description?: string;
  isPremium?: boolean;
  isCustom?: boolean;
  bands: EqualizerBand[];
  bassBoost?: number;
  virtualizer?: number;
  reverb?: number;
}

/**
 * Definisi Store yang sinkron dengan implementasi store.ts
 */
export interface EqualizerStore {
  // --- State ---
  bands: EqualizerBand[];
  activePresetId: string;
  isEQEnabled: boolean;
  isBassEnabled: boolean;
  isVirtualizerEnabled: boolean;
  isReverbEnabled: boolean;
  customPresets: Preset[];
  bassStrength: number;
  virtualizerLevel: number;
  reverbPreset: number;
  // Master gain linear 0,251..3,98 = skala dB -12..+12 (1.0 = netral, 0 dB).
  // Bukan bagian profil preset.
  masterGain: number;
  audioSessionId: number;
  isInitialized: boolean;
  // Preferensi isEQEnabled sebelum DSP Guard mematikannya saat masuk
  // bit-perfect (2026-11-19, ronde clean-cozy). null = tidak ada yang
  // perlu dipulihkan. Ikut dipersist supaya preferensi tahan restart.
  eqEnabledBeforeBitPerfect: boolean | null;

  // --- Actions ---
  initialize: () => Promise<void>;
  setAudioSessionId: (id: number) => void;
  setEqEnabledBeforeBitPerfect: (value: boolean | null) => void;

  // Master Switch
  setEQEnabled: (enabled: boolean) => Promise<void>;
  toggleEQ: () => Promise<void>;

  // Individual Switches
  setBassEnabled: (enabled: boolean) => Promise<void>;
  setVirtualizerEnabled: (enabled: boolean) => Promise<void>;
  setReverbEnabled: (enabled: boolean) => Promise<void>;

  // Value Adjustments
  setBassBoost: (strength: number) => Promise<void>;
  setVirtualizer: (level: number) => Promise<void>;
  setReverb: (preset: number) => Promise<void>;
  setMasterGain: (gain: number) => Promise<void>;
  setBandGain: (index: number, gain: number) => void;
  setBandsGain: (gains: number[]) => Promise<void>; // Ditambahkan untuk Full EQ Apply

  // (Item 7) Trailing flush saat drag dilepas — kirim nilai akhir drag
  // SEKARANG, bukan menunggu timer trailing ≤100 ms. Idempotent +
  // no-op bila tidak ada pending (tidak double-fire).
  flushBandDrag: () => void;
  flushBassBoostDrag: () => void;
  flushVirtualizerDrag: () => void;
  flushMasterGainDrag: () => void;

  // Preset Management
  applyPreset: (presetId: string) => void;
  saveCustomPreset: (name: string) => void;
  deleteCustomPreset: (id: string) => void;
  resetToDefault: () => Promise<void>;
}

/**
 * State Ringkas untuk dikonsumsi Hook atau Component
 */
export interface EqualizerState {
  currentBands: EqualizerBand[];
  bassStrength: number;
  virtualizerLevel: number;
  reverbPreset: number;
  activePresetId: string;
  isEQEnabled: boolean;
  isBassEnabled: boolean;
  isVirtualizerEnabled: boolean;
  isReverbEnabled: boolean;
}
