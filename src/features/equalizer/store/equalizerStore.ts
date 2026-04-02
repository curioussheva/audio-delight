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

      // Tambahkan State Baru
      bassStrength: 0, // 0 - 1000
      reverbPreset: 0, // 0 - 6 (None, SmallRoom, MediumRoom, LargeRoom, etc)
      virtualizerLevel: 0, // 0 - 1000 (Sound Stage / Spacial)

      // Action untuk Bass Boost
      setBassBoost: async (strength: number) => {
        set({ bassStrength: strength });
        if (get().isEQEnabled) {
          // Panggil ke engine
          await (audioEngine as any).setBassBoost?.(strength);
        }
      },

      // Action untuk Sound Stage (Virtualizer)
      setVirtualizer: async (level: number) => {
        set({ virtualizerLevel: level });
        if (get().isEQEnabled) {
          await (audioEngine as any).setVirtualizer?.(level);
        }
      },

      // Action untuk Reverb
      setReverb: async (preset: number) => {
        set({ reverbPreset: preset });
        if (get().isEQEnabled) {
          await (audioEngine as any).setReverbPreset?.(preset);
        }
      },

      // Update setEQEnabled agar mengaktifkan semua efek sekaligus
      setEQEnabled: async (enabled: boolean) => {
        set({ isEQEnabled: enabled });
        const state = get();

        if (enabled) {
          // Terapkan semua efek yang tersimpan
          state.bands.forEach((b) =>
            (audioEngine as any).setEqBand?.(b.id, b.gain),
          );
          await (audioEngine as any).setBassBoost?.(state.bassStrength);
          await (audioEngine as any).setVirtualizer?.(state.virtualizerLevel);
          await (audioEngine as any).setReverbPreset?.(state.reverbPreset);
        } else {
          // Lepas semua efek (Bypass)
          await (audioEngine as any).releaseAllFX?.();
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
