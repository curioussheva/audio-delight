// src/features/outputprofile/store/outputProfileStore.ts
//
// State Profil per Output — store DEDIKASI dengan kunci persist sendiri
// ("output-profile-storage"), mengikuti pola crossfadeStore: default OFF
// (MATI — tidak pernah mengubah suara user lama secara diam-diam),
// DI LUAR preset EQ (pemetaan ini BUKAN preset; ia hanya memilih preset
// mana yang diterapkan saat output berubah).
//
// Store ini SENGAJA tidak mengimpor equalizerStore / native / React:
// supaya tetap bisa diuji Jest tanpa mock bridge.

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DEFAULT_OUTPUT_PROFILE_MAP,
  type ConfigurableOutputCategory,
  type OutputProfileMap,
} from "../outputProfile";

export interface OutputProfileStore {
  /** Sakelar utama. Default false — user harus opt-in di Settings. */
  enabled: boolean;
  /** Kategori -> preset id, atau null ("tetap seperti sekarang"). */
  mapping: OutputProfileMap;
  /** Nyalakan/matikan fitur. */
  setEnabled: (enabled: boolean) => void;
  /** Pilih preset (atau null = tanpa perubahan) untuk satu kategori. */
  setProfileForCategory: (
    category: ConfigurableOutputCategory,
    presetId: string | null,
  ) => void;
  /** Kembalikan pemetaan default (speaker -> Flat, sisanya null). */
  resetToDefaults: () => void;
}

export const useOutputProfileStore = create<OutputProfileStore>()(
  persist(
    (set) => ({
      enabled: false,
      mapping: { ...DEFAULT_OUTPUT_PROFILE_MAP },

      setEnabled: (enabled: boolean) => {
        set({ enabled });
      },

      setProfileForCategory: (category, presetId) => {
        set((state) => ({
          mapping: { ...state.mapping, [category]: presetId },
        }));
      },

      resetToDefaults: () => {
        set({ mapping: { ...DEFAULT_OUTPUT_PROFILE_MAP } });
      },
    }),
    {
      name: "output-profile-storage",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        enabled: state.enabled,
        mapping: state.mapping,
      }),
    },
  ),
);

export default useOutputProfileStore;
