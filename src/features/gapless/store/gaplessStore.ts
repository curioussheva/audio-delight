// src/features/gapless/store/gaplessStore.ts
//
// State Gapless — store DEDIKASI dengan kunci persist sendiri
// ("gapless-storage"), mengikuti pola crossfadeStore: default ON
// (gapless adalah perilaku yang diharapkan player audiophile —
// album live / lagu bersambung tidak boleh terpotong; user bisa
// mematikan kapan saja), DI LUAR preset EQ (preset adalah kurva nada,
// bukan transisi antar lagu). Nilai didorong ke native
// (PlaybackController via NativeDSPModule.setGaplessEnabled) —
// BUKAN lewat rantai DSP, jadi restore-nya TIDAK di-gate sakelar EQ
// (lihat restoreToNative yang dipanggil equalizerStore.initialize
// tanpa gate + entri di applyAllEffectsToNative).

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NativeDSPModule from "@/specs/NativeDSPModule";
import { pushDsp } from "@/features/equalizer/api/pushDsp";
import { GAPLESS_DEFAULT_ENABLED, GAPLESS_STORAGE_KEY } from "../gapless";

export interface GaplessStore {
  /** Gapless hidup/mati. Default ON. */
  gaplessEnabled: boolean;
  /** Simpan niat user + dorong ke native (pola N23: gagal -> log saja). */
  setGaplessEnabled: (enabled: boolean) => Promise<void>;
  /** Dorong nilai tersimpan ke native (restore saat app start / apply). */
  restoreToNative: () => Promise<void>;
}

export const useGaplessStore = create<GaplessStore>()(
  persist(
    (set, get) => ({
      gaplessEnabled: GAPLESS_DEFAULT_ENABLED,

      setGaplessEnabled: async (enabled: boolean) => {
        set({ gaplessEnabled: enabled });
        // EQ-17: satu helper pushDsp — tanpa createAudioSession
        // sendiri per perubahan (dulu 2 janji async: sesi + setter).
        await pushDsp("Gapless", (sessionId) =>
          NativeDSPModule.setGaplessEnabled(enabled, sessionId),
        );
      },

      restoreToNative: async () => {
        await pushDsp("Gapless", (sessionId) =>
          NativeDSPModule.setGaplessEnabled(
            get().gaplessEnabled,
            sessionId,
          ),
        );
      },
    }),
    {
      name: GAPLESS_STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      // Fungsi tidak ikut disimpan.
      partialize: (state) => ({
        gaplessEnabled: state.gaplessEnabled,
      }),
    },
  ),
);

export default useGaplessStore;
