/**
 * PresetStorage — Week 4
 * Simpan/load custom EQ preset ke AsyncStorage
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Preset } from '../types/audio.types';
import { DEFAULT_Q, EQ_FREQUENCIES, EQ_BAND_TYPES } from '../constants/eq';

const KEY = 'audiodelight-custom-presets';

export async function loadCustomPresets(): Promise<Preset[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function saveCustomPreset(preset: Preset): Promise<void> {
  const existing = await loadCustomPresets();
  const idx = existing.findIndex(p => p.id === preset.id);
  if (idx >= 0) existing[idx] = preset;
  else existing.push(preset);
  await AsyncStorage.setItem(KEY, JSON.stringify(existing));
}

export async function deleteCustomPreset(id: string): Promise<void> {
  const existing = await loadCustomPresets();
  await AsyncStorage.setItem(KEY, JSON.stringify(existing.filter(p => p.id !== id)));
}

export function createCustomPreset(name: string, gains: number[]): Preset {
  return {
    id: `custom_${Date.now()}`,
    name,
    description: 'Custom preset',
    isPremium: false,
    bands: EQ_FREQUENCIES.map((freq, i) => ({
      id: i, frequency: freq,
      gain: gains[i] ?? 0,
      q: DEFAULT_Q,
      type: EQ_BAND_TYPES[i],
    })),
  };
}
