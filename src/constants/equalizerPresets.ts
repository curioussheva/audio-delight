// src/constants/equalizerPresets.ts
import { Preset, EqualizerBand } from '@/types/equalizer';

export const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
export const EQ_BAND_TYPES: Array<'peaking' | 'lowshelf' | 'highshelf'> = [
  'lowshelf', 'peaking', 'peaking', 'peaking', 'peaking',
  'peaking', 'peaking', 'peaking', 'peaking', 'highshelf'
];
export const DEFAULT_Q = 1.414;

const make = (gains: number[], q = DEFAULT_Q): EqualizerBand[] =>
  EQ_FREQUENCIES.map((freq, i) => ({
    id: i,
    frequency: freq,
    gain: gains[i] ?? 0,
    q,
    type: EQ_BAND_TYPES[i],
  }));

export const ALL_PRESETS: Preset[] = [
  { 
    id: 'flat', 
    name: 'Flat', 
    description: 'Tanpa EQ', 
    isPremium: false, 
    bands: make([0,0,0,0,0,0,0,0,0,0]) 
  },
  { 
    id: 'bass-heavy', 
    name: 'Bass Heavy', 
    description: 'Punchy bass untuk EDM & hip-hop', 
    isPremium: false, 
    bands: make([8,7,5,2,0,-1,-1,0,1,1]) 
  },
  { 
    id: 'clarity', 
    name: 'Clarity', 
    description: 'Detail vokal & treble', 
    isPremium: false, 
    bands: make([-1,-1,0,0,1,2,3,5,6,5]) 
  },
  { 
    id: 'vocal', 
    name: 'Vocal', 
    description: 'Presence vokal maksimal', 
    isPremium: false, 
    bands: make([-2,-2,-1,0,2,4,3,2,1,0]) 
  },
  { 
    id: 'acoustic', 
    name: 'Acoustic', 
    description: 'Hangat untuk instrumen akustik', 
    isPremium: false, 
    bands: make([2,3,4,2,0,0,1,2,3,2]) 
  },
  { 
    id: 'night', 
    name: 'Night Mode', 
    description: 'Kurangi treble, jaga detail', 
    isPremium: false, 
    bands: make([2,1,0,0,0,0,-1,-2,-3,-4]) 
  },
  { 
    id: 'loudness', 
    name: 'Loudness', 
    description: 'Bass & treble boost klasik', 
    isPremium: false, 
    bands: make([6,4,2,0,0,0,1,3,4,5]) 
  },
  { 
    id: 'rock', 
    name: 'Rock', 
    description: 'Energi untuk musik rock', 
    isPremium: false, 
    bands: make([4,3,2,0,0,1,3,4,3,2]) 
  },
  { 
    id: 'jazz', 
    name: 'Jazz', 
    description: 'Warm untuk jazz & acoustic', 
    isPremium: false, 
    bands: make([2,2,2,1,0,0,1,2,3,2]) 
  },
  { 
    id: 'classical', 
    name: 'Classical', 
    description: 'Natural untuk orkestra', 
    isPremium: false, 
    bands: make([0,0,0,0,0,0,1,2,3,3]) 
  },
];