// src/features/equalizer/store/equalizerStore.ts

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { EqualizerStore, Preset } from "@/features/equalizer/types";
import { ALL_PRESETS, makeBands } from "../constants/presets";
import { NativeModules, Platform } from "react-native";
import { audioEngine } from "@/features/player/api/engine";

// Gunakan NativeDSPModule yang sudah kita buat di Kotlin
const { NativeDSPModule } = NativeModules;

// Helper untuk mendapatkan audio session ID dengan aman
const getCurrentSessionId = async (): Promise<number> => {
  try {
    // Coba dari audioEngine
    const sessionId = await (audioEngine as any).getAudioSessionId?.();
    if (sessionId && sessionId !== -1) return sessionId;

    // Coba dari TrackPlayer
    const TrackPlayer = require("react-native-track-player").default;
    const playerSessionId = await (TrackPlayer as any).getAudioSessionId?.();
    if (playerSessionId && playerSessionId !== -1) return playerSessionId;

    return -1;
  } catch (error) {
    console.warn("[EQ Store] Failed to get session ID:", error);
    return -1;
  }
};

// Helper untuk apply semua efek ke native
const applyAllEffectsToNative = async (
  bands: Array<{ gain: number }>,
  bassStrength: number,
  virtualizerLevel: number,
  reverbPreset: number,
  sessionId: number,
) => {
  if (!NativeDSPModule || sessionId === -1) return false;

  try {
    const gains = bands.map((b) => Math.min(12, Math.max(-12, b.gain)));

    // Apply semua efek dalam batch
    if (NativeDSPModule.setFullEqualizer) {
      await NativeDSPModule.setFullEqualizer(gains, sessionId);
    }

    if (NativeDSPModule.setBassBoost) {
      await NativeDSPModule.setBassBoost(bassStrength, sessionId);
    }

    if (NativeDSPModule.setVirtualizer) {
      await NativeDSPModule.setVirtualizer(virtualizerLevel, sessionId);
    }

    if (NativeDSPModule.setReverbPreset) {
      await NativeDSPModule.setReverbPreset(reverbPreset, sessionId);
    }

    return true;
  } catch (error) {
    console.error("[EQ Store] Failed to apply effects:", error);
    return false;
  }
};

export const useEqualizerStore = create<EqualizerStore>()(
  persist(
    (set, get) => ({
      // --- Initial State ---
      bands: makeBands([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      activePresetId: "flat",
      isEQEnabled: false,
      customPresets: [],
      bassStrength: 0,
      reverbPreset: 0,
      virtualizerLevel: 0,
      audioSessionId: -1,
      isInitialized: false,

      // --- Actions ---

      initialize: async () => {
        if (get().isInitialized) return;

        console.log("[EQ Store] Initializing...");

        // Only on Android
        if (Platform.OS !== "android") {
          set({ isInitialized: true });
          return;
        }

        try {
          const sessionId = await getCurrentSessionId();
          set({ audioSessionId: sessionId, isInitialized: true });

          // If EQ was enabled, re-apply
          if (get().isEQEnabled && sessionId !== -1) {
            await get().setEQEnabled(true);
          }
        } catch (error) {
          console.error("[EQ Store] Initialization failed:", error);
          set({ isInitialized: true });
        }
      },

      setAudioSessionId: (id: number) => {
        console.log(`[EQ Store] Audio session ID set to: ${id}`);
        set({ audioSessionId: id });

        // Jika EQ aktif, langsung apply ke session baru ini
        if (get().isEQEnabled && id !== -1) {
          get().setEQEnabled(true);
        }
      },

      toggleEQ: async () => {
        const newState = !get().isEQEnabled;
        await get().setEQEnabled(newState);
      },

      setEQEnabled: async (enabled: boolean) => {
        const {
          bands,
          bassStrength,
          virtualizerLevel,
          reverbPreset,
          audioSessionId,
        } = get();

        console.log(`[EQ Store] Setting EQ enabled: ${enabled}`);
        set({ isEQEnabled: enabled });

        if (enabled && audioSessionId !== -1 && NativeDSPModule) {
          console.log("🎛️ [EQ Store] Engaged on Session:", audioSessionId);
          await applyAllEffectsToNative(
            bands,
            bassStrength,
            virtualizerLevel,
            reverbPreset,
            audioSessionId,
          );
        } else if (!enabled) {
          console.log("🔌 [EQ Store] Bypass");
          if (NativeDSPModule?.releaseAllFX) {
            await NativeDSPModule.releaseAllFX();
          }
        }
      },

      setBassBoost: async (strength: number) => {
        const { isEQEnabled, audioSessionId } = get();
        const clampedStrength = Math.min(100, Math.max(0, strength));

        set({ bassStrength: clampedStrength });

        if (
          isEQEnabled &&
          audioSessionId !== -1 &&
          NativeDSPModule?.setBassBoost
        ) {
          await NativeDSPModule.setBassBoost(clampedStrength, audioSessionId);
        }
      },

      setVirtualizer: async (level: number) => {
        const { isEQEnabled, audioSessionId } = get();
        const clampedLevel = Math.min(100, Math.max(0, level));

        set({ virtualizerLevel: clampedLevel });

        if (
          isEQEnabled &&
          audioSessionId !== -1 &&
          NativeDSPModule?.setVirtualizer
        ) {
          await NativeDSPModule.setVirtualizer(clampedLevel, audioSessionId);
        }
      },

      setReverb: async (preset: number) => {
        const { isEQEnabled, audioSessionId } = get();
        const clampedPreset = Math.min(6, Math.max(0, preset));

        set({ reverbPreset: clampedPreset });

        if (
          isEQEnabled &&
          audioSessionId !== -1 &&
          NativeDSPModule?.setReverbPreset
        ) {
          await NativeDSPModule.setReverbPreset(clampedPreset, audioSessionId);
        }
      },

      setBandGain: (index: number, gain: number) => {
        const { bands, isEQEnabled, audioSessionId } = get();
        const clampedGain = Math.min(12, Math.max(-12, gain));
        const newBands = bands.map((b, i) =>
          i === index ? { ...b, gain: clampedGain } : b,
        );

        set({ bands: newBands, activePresetId: "custom" });

        if (isEQEnabled && audioSessionId !== -1 && NativeDSPModule) {
          // Kirim perubahan band spesifik ke native
          if (NativeDSPModule.setEqualizer) {
            NativeDSPModule.setEqualizer(index, clampedGain, audioSessionId);
          }
        }
      },

      // Method untuk update multiple bands sekaligus
      setBandsGain: async (gains: number[]) => {
        const { isEQEnabled, audioSessionId, bands } = get();
        const newBands = bands.map((b, i) => ({
          ...b,
          gain: Math.min(
            12,
            Math.max(-12, gains[i] !== undefined ? gains[i] : b.gain),
          ),
        }));

        set({ bands: newBands, activePresetId: "custom" });

        if (isEQEnabled && audioSessionId !== -1 && NativeDSPModule) {
          const clampedGains = gains.map((g) => Math.min(12, Math.max(-12, g)));
          if (NativeDSPModule.setFullEqualizer) {
            await NativeDSPModule.setFullEqualizer(
              clampedGains,
              audioSessionId,
            );
          }
        }
      },

      applyPreset: (presetId: string) => {
        const preset =
          ALL_PRESETS.find((p) => p.id === presetId) ||
          get().customPresets.find((p) => p.id === presetId);

        if (preset) {
          const newBands = preset.bands.map((b) => ({ ...b }));
          set({ activePresetId: presetId, bands: newBands });

          const { isEQEnabled, audioSessionId } = get();
          if (
            isEQEnabled &&
            audioSessionId !== -1 &&
            NativeDSPModule?.setFullEqualizer
          ) {
            const gains = newBands.map((b) => b.gain);
            NativeDSPModule.setFullEqualizer(gains, audioSessionId);
          }
        }
      },

      saveCustomPreset: (name: string) => {
        const { bands, customPresets } = get();
        const newPreset: Preset = {
          id: `custom_${Date.now()}`,
          name,
          isCustom: true,
          bands: JSON.parse(JSON.stringify(bands)),
        };

        set({
          customPresets: [...customPresets, newPreset],
          activePresetId: newPreset.id,
        });

        console.log(`[EQ Store] Saved custom preset: ${name}`);
      },

      deleteCustomPreset: (id: string) => {
        const filtered = get().customPresets.filter((p) => p.id !== id);
        set({ customPresets: filtered });

        if (get().activePresetId === id) {
          get().applyPreset("flat");
        }

        console.log(`[EQ Store] Deleted custom preset: ${id}`);
      },

      resetToDefault: async () => {
        const defaultBands = makeBands([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        set({
          bands: defaultBands,
          activePresetId: "flat",
          bassStrength: 0,
          virtualizerLevel: 0,
          reverbPreset: 0,
        });

        const { isEQEnabled, audioSessionId } = get();
        if (isEQEnabled && audioSessionId !== -1 && NativeDSPModule) {
          const gains = defaultBands.map((b) => b.gain);
          if (NativeDSPModule.setFullEqualizer) {
            await NativeDSPModule.setFullEqualizer(gains, audioSessionId);
          }
          if (NativeDSPModule.setBassBoost) {
            await NativeDSPModule.setBassBoost(0, audioSessionId);
          }
          if (NativeDSPModule.setVirtualizer) {
            await NativeDSPModule.setVirtualizer(0, audioSessionId);
          }
          if (NativeDSPModule.setReverbPreset) {
            await NativeDSPModule.setReverbPreset(0, audioSessionId);
          }
        }

        console.log("[EQ Store] Reset to default");
      },
    }),
    {
      name: "equalizer-storage",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        bands: state.bands,
        activePresetId: state.activePresetId,
        customPresets: state.customPresets,
        bassStrength: state.bassStrength,
        virtualizerLevel: state.virtualizerLevel,
        reverbPreset: state.reverbPreset,
        isEQEnabled: state.isEQEnabled,
      }),
      onRehydrateStorage: () => {
        console.log("[EQ Store] Hydrating from storage...");
        return (state, error) => {
          if (error) {
            console.error("[EQ Store] Hydration error:", error);
          } else if (state) {
            console.log("[EQ Store] Hydration complete");
          }
        };
      },
    },
  ),
);

// Auto-initialize on store creation
if (Platform.OS === "android") {
  setTimeout(() => {
    useEqualizerStore.getState().initialize();
  }, 1000);
}
