// src/features/equalizer/store/equalizerStore.ts

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { EqualizerStore, Preset } from "@/features/equalizer/types";
import { ALL_PRESETS, makeBands } from "../constants/presets";
import { audioEngine } from "@/features/player/api/engine";
import { NativeDSPModule } from "@/features/equalizer/api/nativeInterface";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const getCurrentSessionId = async (): Promise<number> => {
  try {
    // 1. Coba ambil langsung dari TrackPlayer (Paling Akurat untuk RNTP)
    const TrackPlayer = require("react-native-track-player").default;
    const playerSessionId = await TrackPlayer.getAudioSessionId();

    if (playerSessionId && playerSessionId !== 0 && playerSessionId !== -1) {
      console.log(
        `[EQ Store] Found Real Session ID from RNTP: ${playerSessionId}`,
      );
      return playerSessionId;
    }

    // 2. Fallback ke AudioManager (ID yang kamu dapat 11753 tadi)
    const sessionId = await (audioEngine as any).getAudioSessionId?.();
    return sessionId || -1;
  } catch (error) {
    return -1;
  }
};

// Helper untuk apply semua efek ke native dengan individual try-catch
const applyAllEffectsToNative = async (state: any) => {
  const { bands, isEQEnabled, audioSessionId } = state;

  if (!NativeDSPModule || !isEQEnabled) return false;

  // Gunakan ID yang sudah ada di state (yang dikirim dari playback.ts)
  // Jangan panggil TrackPlayer.getAudioSessionId() karena tidak tersedia
  let finalSessionId = audioSessionId;

  if (finalSessionId <= 0) {
    // Fallback terakhir: minta ke NativeModule kita untuk cari ID yang aktif
    finalSessionId = await NativeDSPModule.getActiveAudioSessionId();
  }

  if (finalSessionId <= 0) return false;

  try {
    // Ingat: Di Java, gains ini harus dikali 100
    const gains = bands.map((b: any) => b.gain);
    await NativeDSPModule.setFullEqualizer(gains, finalSessionId);
    console.log(`[DSP] Applied to Session: ${finalSessionId}`);
  } catch (e) {
    console.error("[EQ Store] Failed to apply:", e);
  }
  return true;
};

// ─────────────────────────────────────────────
// Store Implementation
// ─────────────────────────────────────────────

export const useEqualizerStore = create<EqualizerStore>()(
  persist(
    (set, get) => ({
      // --- Initial State ---
      bands: makeBands([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      activePresetId: "flat",
      isEQEnabled: false,
      isBassEnabled: true,
      isVirtualizerEnabled: true,
      isReverbEnabled: true,
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

        if (Platform.OS !== "android") {
          set({ isInitialized: true });
          return;
        }

        try {
          const sessionId = await getCurrentSessionId();
          set({ audioSessionId: sessionId, isInitialized: true });

          if (get().isEQEnabled && sessionId !== -1) {
            await applyAllEffectsToNative(get());
          }
        } catch (error) {
          set({ isInitialized: true });
        }
      },

      setAudioSessionId: (id: number) => {
        set({ audioSessionId: id });
        if (get().isEQEnabled && id !== -1) {
          applyAllEffectsToNative(get());
        }
      },

      toggleEQ: async () => {
        const newState = !get().isEQEnabled;
        await get().setEQEnabled(newState);
      },

      setEQEnabled: async (enabled: boolean) => {
        set({ isEQEnabled: enabled });
        if (enabled && get().audioSessionId !== -1) {
          await applyAllEffectsToNative(get());
        } else if (!enabled && NativeDSPModule?.releaseAllFX) {
          await NativeDSPModule.releaseAllFX();
        }
      },

      // --- Individual Switch Actions ---

      setBassEnabled: async (enabled: boolean) => {
        set({ isBassEnabled: enabled });
        const { isEQEnabled, audioSessionId, bassStrength } = get();
        if (isEQEnabled && audioSessionId !== -1) {
          await NativeDSPModule.setBassBoost(
            enabled ? bassStrength : 0,
            audioSessionId,
          );
        }
      },

      setVirtualizerEnabled: async (enabled: boolean) => {
        set({ isVirtualizerEnabled: enabled });
        const { isEQEnabled, audioSessionId, virtualizerLevel } = get();
        if (isEQEnabled && audioSessionId !== -1) {
          await NativeDSPModule.setVirtualizer(
            enabled ? virtualizerLevel : 0,
            audioSessionId,
          );
        }
      },

      setReverbEnabled: async (enabled: boolean) => {
        set({ isReverbEnabled: enabled });
        const { isEQEnabled, audioSessionId, reverbPreset } = get();
        if (isEQEnabled && audioSessionId !== -1) {
          await NativeDSPModule.setReverbPreset(
            enabled ? reverbPreset : 0,
            audioSessionId,
          );
        }
      },

      // --- Value Adjustment Actions ---

      setBassBoost: async (strength: number) => {
        const clamped = Math.min(1000, Math.max(0, strength));
        set({ bassStrength: clamped });
        const { isEQEnabled, isBassEnabled, audioSessionId } = get();
        if (isEQEnabled && isBassEnabled && audioSessionId !== -1) {
          await NativeDSPModule.setBassBoost(clamped, audioSessionId);
        }
      },

      setVirtualizer: async (level: number) => {
        const clamped = Math.min(1000, Math.max(0, level));
        set({ virtualizerLevel: clamped });
        const { isEQEnabled, isVirtualizerEnabled, audioSessionId } = get();
        if (isEQEnabled && isVirtualizerEnabled && audioSessionId !== -1) {
          await NativeDSPModule.setVirtualizer(clamped, audioSessionId);
        }
      },

      setReverb: async (preset: number) => {
        const clamped = Math.min(6, Math.max(0, preset));
        set({ reverbPreset: clamped });
        const { isEQEnabled, isReverbEnabled, audioSessionId } = get();
        if (isEQEnabled && isReverbEnabled && audioSessionId !== -1) {
          await NativeDSPModule.setReverbPreset(clamped, audioSessionId);
        }
      },

      setBandGain: (index: number, gain: number) => {
        const clampedGain = Math.min(12, Math.max(-12, gain));
        const newBands = get().bands.map((b, i) =>
          i === index ? { ...b, gain: clampedGain } : b,
        );
        set({ bands: newBands, activePresetId: "custom" });

        const { isEQEnabled, audioSessionId } = get();
        if (
          isEQEnabled &&
          audioSessionId !== -1 &&
          NativeDSPModule?.setEqualizer
        ) {
          // Kotlin setEqualizer tidak konversi, jadi kita konversi di sini
          const millibels = Math.round(clampedGain * 100);
          NativeDSPModule.setEqualizer(index, millibels, audioSessionId);
        }
      },

      setBandsGain: async (gains: number[]) => {
        const newBands = get().bands.map((b, i) => ({
          ...b,
          gain: Math.min(12, Math.max(-12, gains[i] ?? b.gain)),
        }));
        set({ bands: newBands, activePresetId: "custom" });

        if (
          get().isEQEnabled &&
          get().audioSessionId !== -1 &&
          NativeDSPModule?.setFullEqualizer
        ) {
          await NativeDSPModule.setFullEqualizer(gains, get().audioSessionId);
        }
      },

      applyPreset: (presetId: string) => {
        const preset =
          ALL_PRESETS.find((p) => p.id === presetId) ||
          get().customPresets.find((p) => p.id === presetId);
        if (preset) {
          const newBands = preset.bands.map((b) => ({ ...b }));
          set({ activePresetId: presetId, bands: newBands });
          if (get().isEQEnabled && get().audioSessionId !== -1) {
            applyAllEffectsToNative(get());
          }
        }
      },

      saveCustomPreset: (name: string) => {
        const newPreset: Preset = {
          id: `custom_${Date.now()}`,
          name,
          isCustom: true,
          bands: JSON.parse(JSON.stringify(get().bands)),
        };
        set({
          customPresets: [...get().customPresets, newPreset],
          activePresetId: newPreset.id,
        });
      },

      deleteCustomPreset: (id: string) => {
        const filtered = get().customPresets.filter((p) => p.id !== id);
        set({ customPresets: filtered });
        if (get().activePresetId === id) get().applyPreset("flat");
      },

      resetToDefault: async () => {
        set({
          bands: makeBands([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
          activePresetId: "flat",
          bassStrength: 0,
          virtualizerLevel: 0,
          reverbPreset: 0,
        });
        if (get().isEQEnabled && get().audioSessionId !== -1) {
          await applyAllEffectsToNative(get());
        }
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
        isBassEnabled: state.isBassEnabled,
        isVirtualizerEnabled: state.isVirtualizerEnabled,
        isReverbEnabled: state.isReverbEnabled,
      }),
    },
  ),
);

if (Platform.OS === "android") {
  setTimeout(() => {
    useEqualizerStore.getState().initialize();
  }, 1000);
}
