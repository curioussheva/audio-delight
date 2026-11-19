// src/features/player/store/artworkDisplayStore.ts
//
// Tampilan sampul di layar Player — store DEDIKASI dengan kunci persist
// sendiri ("artwork-display-storage"), mengikuti pola hrtfStore.
// Keputusan csheva 2026-11-20: sampul tampil utuh (contain) secara
// default — sampul landscape ("CALM SCOTTISH MUSIC") tidak lagi
// terpotong kiri-kanan seperti saat contentFit="cover". Pengaturan di
// Settings → Tampilan bisa mengembalikannya ke cover.
//
// Store ini murni tampilan: tidak menyentuh audio/DSP/playback, tidak
// ada dorongan ke native — layar Player membaca artworkFit dan
// meneruskannya sebagai contentFit Image.

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

/** Cara sampul mengisi kotak persegi di layar Player. */
export type ArtworkFit = "contain" | "cover";

export interface ArtworkDisplayStore {
  /**
   * contain (default): seluruh sampul tampil utuh; sampul landscape
   * mendapat pita kosong atas-bawah di dalam kotak.
   * cover: sampul mengisi penuh kotak; sisi sampul landscape terpotong.
   */
  artworkFit: ArtworkFit;
  /** Simpan pilihan user (persist). */
  setArtworkFit: (fit: ArtworkFit) => void;
}

export const useArtworkDisplayStore = create<ArtworkDisplayStore>()(
  persist(
    (set) => ({
      artworkFit: "contain",

      setArtworkFit: (artworkFit) => set({ artworkFit }),
    }),
    {
      name: "artwork-display-storage",
      storage: createJSONStorage(() => AsyncStorage),
      // Fungsi tidak ikut disimpan.
      partialize: (state) => ({ artworkFit: state.artworkFit }),
    },
  ),
);

export default useArtworkDisplayStore;
