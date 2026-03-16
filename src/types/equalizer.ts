// src/types/equalizer.ts

export type BandType = 'peaking' | 'lowshelf' | 'highshelf';

export interface EqualizerBand {
  id: number;
  frequency: number;
  gain: number;
  q: number;
  type: BandType;
}

export interface Preset {
  id: string;
  name: string;
  description?: string; // Dibuat opsional
  isPremium?: boolean;
  isCustom?: boolean;   // Tambahan: Penanda preset buatan user
  bands: EqualizerBand[];
}

export interface EqualizerStore {
  // State
  bands: EqualizerBand[];
  activePresetId: string;
  isEQEnabled: boolean;
  customPresets: Preset[]; // Array untuk menyimpan preset user

  // Actions
  setEQEnabled: (enabled: boolean) => void;
  applyPreset: (presetId: string) => void;
  setBandGain: (index: number, gain: number) => void;
  saveCustomPreset: (name: string) => void;     // Fungsi Save
  deleteCustomPreset: (id: string) => void;     // Fungsi Delete
}
