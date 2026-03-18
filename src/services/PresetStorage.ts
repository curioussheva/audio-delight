import AsyncStorage from "@react-native-async-storage/async-storage";
import { Preset } from "@/types/equalizer";

const CUSTOM_PRESETS_KEY = "@pristine_custom_presets";

export const PresetStorage = {
  async saveCustomPreset(preset: Preset): Promise<void> {
    const existing = await this.getCustomPresets();
    const updated = [...existing.filter((p) => p.id !== preset.id), preset];
    await AsyncStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(updated));
  },

  async getCustomPresets(): Promise<Preset[]> {
    const data = await AsyncStorage.getItem(CUSTOM_PRESETS_KEY);
    return data ? JSON.parse(data) : [];
  },

  async deletePreset(id: string): Promise<void> {
    const existing = await this.getCustomPresets();
    const updated = existing.filter((p) => p.id !== id);
    await AsyncStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(updated));
  },
};
