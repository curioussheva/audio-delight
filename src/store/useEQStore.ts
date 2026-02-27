import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EQBand, Preset } from '../types/audio.types';
import { DEFAULT_BANDS } from '../constants/eq';
import AudioEngine from '../audio/AudioEngine';

interface EQState {
  bands: EQBand[];
  activePresetId: string | null;
  isEQEnabled: boolean;

  // Actions
  setBand: (index: number, values: Partial<Pick<EQBand, 'gain' | 'frequency' | 'q'>>) => void;
  applyPreset: (preset: Preset) => void;
  resetBands: () => void;
  setEQEnabled: (enabled: boolean) => void;
}

export const useEQStore = create<EQState>()(
  persist(
    (set, get) => ({
      bands: DEFAULT_BANDS,
      activePresetId: 'flat',
      isEQEnabled: true,

      setBand: (index, values) => {
        const bands = get().bands.map((b, i) =>
          i === index ? { ...b, ...values } : b
        );
        set({ bands, activePresetId: null });

        // Apply to audio engine immediately
        if (get().isEQEnabled && values.gain !== undefined) {
          AudioEngine.setEQBand(index, values.gain, values.frequency, values.q);
        }
      },

      applyPreset: (preset) => {
        set({ bands: preset.bands, activePresetId: preset.id });
        if (get().isEQEnabled) {
          AudioEngine.applyAllBands(preset.bands);
        }
      },

      resetBands: () => {
        set({ bands: DEFAULT_BANDS, activePresetId: 'flat' });
        AudioEngine.applyAllBands(DEFAULT_BANDS);
      },

      setEQEnabled: (enabled) => {
        set({ isEQEnabled: enabled });
        if (!enabled) {
          // Zero out all gains
          AudioEngine.applyAllBands(DEFAULT_BANDS);
        } else {
          // Reapply current bands
          AudioEngine.applyAllBands(get().bands);
        }
      },
    }),
    {
      name: 'audiodelight-eq',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
