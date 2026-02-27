import { Preset } from '../../types/audio.types';
import { EQ_FREQUENCIES, EQ_BAND_TYPES, DEFAULT_Q } from '../../constants/eq';

const makeBands = (gains: number[], q = DEFAULT_Q) =>
  EQ_FREQUENCIES.map((freq, i) => ({
    id: i,
    frequency: freq,
    gain: gains[i],
    q,
    type: EQ_BAND_TYPES[i],
  }));

export const FLAT_PRESET: Preset = {
  id: 'flat',
  name: 'Flat',
  description: 'Tanpa efek EQ',
  isPremium: false,
  bands: makeBands([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
};

export const CLARITY_PRESET: Preset = {
  id: 'clarity',
  name: 'Clarity',
  description: 'Boost high-freq untuk detail suara',
  isPremium: false,
  bands: makeBands([-1, -1, 0, 0, 1, 2, 3, 5, 6, 5]),
};

export const BASS_HEAVY_PRESET: Preset = {
  id: 'bass-heavy',
  name: 'Bass Heavy',
  description: 'Punchy bass untuk EDM & hip-hop',
  isPremium: false,
  bands: makeBands([8, 7, 5, 2, 0, -1, -1, 0, 1, 1]),
};

export const VOCAL_CLEAR_PRESET: Preset = {
  id: 'vocal-clear',
  name: 'Vocal Clear',
  description: 'Presence boost untuk vokal',
  isPremium: false,
  bands: makeBands([-2, -2, -1, 0, 2, 4, 3, 2, 1, 0]),
};

export const ACOUSTIC_PRESET: Preset = {
  id: 'acoustic',
  name: 'Acoustic',
  description: 'Natural warmth untuk instrumen akustik',
  isPremium: false,
  bands: makeBands([2, 3, 4, 2, 0, 0, 1, 2, 3, 2]),
};

export const NIGHT_MODE_PRESET: Preset = {
  id: 'night-mode',
  name: 'Night Mode',
  description: 'Kurangi treble keras, jaga detail',
  isPremium: false,
  bands: makeBands([2, 1, 0, 0, 0, 0, -1, -2, -3, -4]),
};

export const ALL_PRESETS: Preset[] = [
  FLAT_PRESET,
  CLARITY_PRESET,
  BASS_HEAVY_PRESET,
  VOCAL_CLEAR_PRESET,
  ACOUSTIC_PRESET,
  NIGHT_MODE_PRESET,
];
