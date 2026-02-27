import AsyncStorage from '@react-native-async-storage/async-storage';
import { Preset } from '../types/audio.types';

const KEYS = {
  CUSTOM_PRESETS: 'ad:custom_presets',
  LAST_PRESET_ID: 'ad:last_preset_id',
};

export async function saveCustomPreset(preset: Preset): Promise<void> {
  const existing = await loadCustomPresets();
  const updated = [...existing.filter((p) => p.id !== preset.id), preset];
  await AsyncStorage.setItem(KEYS.CUSTOM_PRESETS, JSON.stringify(updated));
}

export async function loadCustomPresets(): Promise<Preset[]> {
  const raw = await AsyncStorage.getItem(KEYS.CUSTOM_PRESETS);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Preset[];
  } catch {
    return [];
  }
}

export async function deleteCustomPreset(id: string): Promise<void> {
  const existing = await loadCustomPresets();
  const updated = existing.filter((p) => p.id !== id);
  await AsyncStorage.setItem(KEYS.CUSTOM_PRESETS, JSON.stringify(updated));
}

export async function saveLastPresetId(id: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.LAST_PRESET_ID, id);
}

export async function loadLastPresetId(): Promise<string | null> {
  return AsyncStorage.getItem(KEYS.LAST_PRESET_ID);
}
