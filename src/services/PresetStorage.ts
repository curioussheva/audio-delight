import AsyncStorage from '@react-native-async-storage/async-storage';
import { Preset } from '@/types/equalizer';

const CUSTOM_PRESETS_KEY = 'pristine_eq_custom_presets';

export const loadCustomPresets = async (): Promise<Preset[]> => {
  try {
    const data = await AsyncStorage.getItem(CUSTOM_PRESETS_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Failed to load custom presets:', error);
    return [];
  }
};

export const saveCustomPreset = async (preset: Preset): Promise<void> => {
  try {
    const existing = await loadCustomPresets();
    const updated = [...existing, preset];
    await AsyncStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('Failed to save custom preset:', error);
  }
};

export const deleteCustomPreset = async (presetId: string): Promise<void> => {
  try {
    const existing = await loadCustomPresets();
    const updated = existing.filter(p => p.id !== presetId);
    await AsyncStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('Failed to delete custom preset:', error);
  }
};

export const updateCustomPreset = async (preset: Preset): Promise<void> => {
  try {
    const existing = await loadCustomPresets();
    const updated = existing.map(p => p.id === preset.id ? preset : p);
    await AsyncStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('Failed to update custom preset:', error);
  }
};