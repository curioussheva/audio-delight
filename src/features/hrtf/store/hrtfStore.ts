// src/features/hrtf/store/hrtfStore.ts
//
// State HRTF — store DEDIKASI dengan kunci persist sendiri
// ("hrtf-storage"), DI LUAR preset EQ (keputusan csheva 2026-11-19,
// langkah 6): preset tidak pernah membaca/menulis flag ini;
// applyPreset tidak menyentuhnya.
//
// Pola mengikuti headphoneStore (efek di luar EQ): NativeDSPModule
// diimpor langsung dari spec, dorongan ke native tanpa gate
// isEQEnabled — toggle HRTF sendiri yang mengaturnya. Pemulihan saat
// app start / ganti session lewat applyAllEffectsToNative di
// equalizerStore (yang membaca flag ini). sessionId diambil dari
// createAudioSession() (F7: panggilan pertama mengalokasikan,
// berikut mengembalikan ID yang sama — bukan state per-sesi, hanya
// token "native siap").

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NativeDSPModule from "@/specs/NativeDSPModule";
import { pushDsp } from "@/features/equalizer/api/pushDsp";

export interface HrtfStore {
  /** HRTF menyala (virtual speaker ±30°). Default OFF. */
  isHrtfEnabled: boolean;
  /** Simpan niat user + dorong ke native (pola N23: gagal -> log saja). */
  setHrtfEnabled: (enabled: boolean) => Promise<void>;
}

export const useHrtfStore = create<HrtfStore>()(
  persist(
    (set) => ({
      isHrtfEnabled: false,

      setHrtfEnabled: async (enabled: boolean) => {
        set({ isHrtfEnabled: enabled });
        // EQ-17: satu helper pushDsp — tanpa createAudioSession
        // sendiri per perubahan (dulu 2 janji async: sesi + setter).
        await pushDsp("HRTF", (sessionId) =>
          NativeDSPModule.setHrtfEnabled(enabled, sessionId),
        );
      },
    }),
    {
      name: "hrtf-storage",
      storage: createJSONStorage(() => AsyncStorage),
      // Fungsi tidak ikut disimpan.
      partialize: (state) => ({ isHrtfEnabled: state.isHrtfEnabled }),
    },
  ),
);

export default useHrtfStore;
