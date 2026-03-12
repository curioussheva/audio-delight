export interface EqualizerBand {
  id?: number;
  frequency: number;
  gain: number;
  q?: number;
  type?: 'peaking' | 'lowshelf' | 'highshelf';
}

export interface EqualizerPreset {
  name: string;
  bands: EqualizerBand[];
}

export interface Preset {
  id: string;
  name: string;
  description?: string;
  isPremium?: boolean;
  bands: EqualizerBand[];
}

export interface EqualizerStore {
  bands: EqualizerBand[];
  activePresetId: string;
  isEQEnabled: boolean;
  applyPreset: (presetId: string) => void;
  setBandGain: (index: number, gain: number) => void;
  setEQEnabled: (enabled: boolean) => void;
}

export const EQ_PRESETS: Record<string, EqualizerBand[]> = {
  flat: [
    { frequency: 32, gain: 0 },
    { frequency: 64, gain: 0 },
    { frequency: 125, gain: 0 },
    { frequency: 250, gain: 0 },
    { frequency: 500, gain: 0 },
    { frequency: 1000, gain: 0 },
    { frequency: 2000, gain: 0 },
    { frequency: 4000, gain: 0 },
    { frequency: 8000, gain: 0 },
    { frequency: 16000, gain: 0 },
  ],
  rock: [
    { frequency: 32, gain: 3 },
    { frequency: 64, gain: 4 },
    { frequency: 125, gain: 3 },
    { frequency: 250, gain: 1 },
    { frequency: 500, gain: 0 },
    { frequency: 1000, gain: 1 },
    { frequency: 2000, gain: 3 },
    { frequency: 4000, gain: 4 },
    { frequency: 8000, gain: 3 },
    { frequency: 16000, gain: 2 },
  ],
  jazz: [
    { frequency: 32, gain: 2 },
    { frequency: 64, gain: 2 },
    { frequency: 125, gain: 2 },
    { frequency: 250, gain: 1 },
    { frequency: 500, gain: 0 },
    { frequency: 1000, gain: 1 },
    { frequency: 2000, gain: 2 },
    { frequency: 4000, gain: 3 },
    { frequency: 8000, gain: 3 },
    { frequency: 16000, gain: 2 },
  ],
  classical: [
    { frequency: 32, gain: 0 },
    { frequency: 64, gain: 0 },
    { frequency: 125, gain: 0 },
    { frequency: 250, gain: 0 },
    { frequency: 500, gain: 0 },
    { frequency: 1000, gain: 0 },
    { frequency: 2000, gain: 2 },
    { frequency: 4000, gain: 3 },
    { frequency: 8000, gain: 4 },
    { frequency: 16000, gain: 4 },
  ],
  bassBooster: [
    { frequency: 32, gain: 6 },
    { frequency: 64, gain: 6 },
    { frequency: 125, gain: 4 },
    { frequency: 250, gain: 2 },
    { frequency: 500, gain: 0 },
    { frequency: 1000, gain: -1 },
    { frequency: 2000, gain: -2 },
    { frequency: 4000, gain: -2 },
    { frequency: 8000, gain: -2 },
    { frequency: 16000, gain: -2 },
  ],
};

export const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
export const EQ_BAND_TYPES: Array<'peaking' | 'lowshelf' | 'highshelf'> = [
  'lowshelf', 'peaking', 'peaking', 'peaking', 'peaking',
  'peaking', 'peaking', 'peaking', 'peaking', 'highshelf'
];
export const DEFAULT_Q = 1.414;