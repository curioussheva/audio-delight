import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { EqualizerStore, Preset } from "@/features/equalizer/types";
import { ALL_PRESETS, makeBands } from "@/features/equalizer/constants/presets";

// PERBAIKAN 1: Gunakan { audioEngine } dengan huruf kecil
import { audioEngine } from "@/features/player/api/engine";

export const useEqualizerStore = create<EqualizerStore>()(
  persist(
    (set, get) => ({
      bands: makeBands([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      activePresetId: "flat",
      isEQEnabled: false,
      customPresets: [],

      setEQEnabled: async (enabled: boolean) => {
        set({ isEQEnabled: enabled });

        if (!enabled) {
          // PERBAIKAN 2: Gunakan audioEngine (huruf kecil)
          // Asumsi: Kita mengirim array 0 sekaligus lebih efisien jika bridge mendukung
          for (let i = 0; i < 10; i++) {
            await (audioEngine as any).setEqBand?.(i, 0);
          }
        } else {
          get().bands.forEach((band) =>
            (audioEngine as any).setEqBand?.(band.id, band.gain),
          );
        }
      },

      applyPreset: (presetId: string) => {
        const { customPresets, isEQEnabled } = get();

        const preset =
          ALL_PRESETS.find((p) => p.id === presetId) ||
          customPresets.find((p) => p.id === presetId);

        if (preset) {
          const newBands = preset.bands.map((b) => ({ ...b }));

          set({
            activePresetId: presetId,
            bands: newBands,
          });

          if (isEQEnabled) {
            newBands.forEach((band) => {
              (audioEngine as any).setEqBand?.(band.id, band.gain);
            });
          }
        }
      },

      setBandGain: (index: number, gain: number) => {
        const { bands, isEQEnabled } = get();
        const newBands = [...bands];
        newBands[index] = { ...newBands[index], gain };

        set({
          bands: newBands,
          activePresetId: "custom_unsaved",
        });

        if (isEQEnabled) {
          (audioEngine as any).setEqBand?.(index, gain);
        }
      },

      saveCustomPreset: (name: string) => {
        const { bands, customPresets } = get();

        const newPreset: Preset = {
          id: `custom_${Date.now()}`,
          name: name,
          description: "Custom user preset",
          isCustom: true,
          bands: bands.map((b) => ({ ...b })),
        };

        set({
          customPresets: [...customPresets, newPreset],
          activePresetId: newPreset.id,
        });
      },

      deleteCustomPreset: (id: string) => {
        const { customPresets, activePresetId } = get();
        const updatedPresets = customPresets.filter((p) => p.id !== id);

        set({ customPresets: updatedPresets });

        if (activePresetId === id) {
          get().applyPreset("flat");
        }
      },
    }),
    {
      name: "equalizer-storage",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
