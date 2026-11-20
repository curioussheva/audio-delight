// src/features/crossfade/store/crossfadeStore.ts
//
// State Crossfade — store DEDIKASI dengan kunci persist sendiri
// ("crossfade-storage"), mengikuti pola hrtfStore: default 0 (MATI —
// tidak pernah mengubah perilaku transisi user lama secara diam-diam),
// DI LUAR preset EQ (preset adalah kurva nada, bukan transisi antar
// lagu). Nilai didorong ke native (PlaybackController via
// NativeDSPModule.setCrossfadeSeconds) — BUKAN lewat rantai DSP,
// jadi restore-nya TIDAK di-gate sakelar EQ (lihat restoreToNative
// yang dipanggil equalizerStore.initialize tanpa gate + entri di
// applyAllEffectsToNative).

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NativeDSPModule from "@/specs/NativeDSPModule";
import {
  clampCrossfadeSeconds,
  CROSSFADE_MIN_SECONDS,
} from "../crossfade";

export interface CrossfadeStore {
  /** Durasi crossfade (detik), 0..12. 0 = mati = perilaku lama. */
  crossfadeSeconds: number;
  /** Simpan niat user + dorong ke native (pola N23: gagal -> log saja). */
  setCrossfadeSeconds: (seconds: number) => Promise<void>;
  /** Dorong nilai tersimpan ke native (restore saat app start / apply). */
  restoreToNative: () => Promise<void>;
}

async function pushToNative(seconds: number): Promise<void> {
  try {
    const { sessionId } = await NativeDSPModule.createAudioSession();
    if (sessionId !== -1) {
      await NativeDSPModule.setCrossfadeSeconds(seconds, sessionId);
    }
  } catch (e) {
    console.error("[Crossfade Store] setCrossfadeSeconds gagal:", e);
  }
}

export const useCrossfadeStore = create<CrossfadeStore>()(
  persist(
    (set, get) => ({
      crossfadeSeconds: CROSSFADE_MIN_SECONDS,

      setCrossfadeSeconds: async (seconds: number) => {
        const clamped = clampCrossfadeSeconds(seconds);
        set({ crossfadeSeconds: clamped });
        await pushToNative(clamped);
      },

      restoreToNative: async () => {
        await pushToNative(get().crossfadeSeconds);
      },
    }),
    {
      name: "crossfade-storage",
      storage: createJSONStorage(() => AsyncStorage),
      // Fungsi tidak ikut disimpan.
      partialize: (state) => ({
        crossfadeSeconds: state.crossfadeSeconds,
      }),
    },
  ),
);

export default useCrossfadeStore;
