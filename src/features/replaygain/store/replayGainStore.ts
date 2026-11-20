// src/features/replaygain/store/replayGainStore.ts
//
// State ReplayGain — store DEDIKASI dengan kunci persist sendiri
// ("replaygain-storage"), mengikuti pola hrtfStore: default OFF (tidak
// pernah mengubah perilaku loudness user lama secara diam-diam), DI LUAR
// preset EQ (preset adalah kurva nada, bukan loudness per-lagu).
//
// SENGAJA TIPIS: store ini hanya menyimpan state + hitung gain efektif.
// Ia TIDAK mengimpor reader (expo-file-system) maupun sqlite — keduanya
// menarik modul native yang tidak bisa dimuat Jest node (dan membuat
// equalizerStore.test ikut runtuh, karena equalizerStore membaca store
// ini). Resolusi tag per lagu (DB -> cache -> baca file -> persist) ada di
// `../apply.ts`, yang hanya diimpor playerStore + Settings.
//
// Store ini TIDAK mendorong apa pun ke native dan TIDAK mengimpor
// equalizerStore/playerStore (arah dependensi satu arah: equalizerStore
// yang membaca store ini lewat `getEffectiveMasterGain` DAN berlangganan
// perubahannya untuk mendorong gain efektif). Yang mendorong gain efektif
// ke native adalah langganan RG di equalizerStore — ia bereaksi pada
// perubahan toggle/mode/tag aktif, jadi toggle berlaku ke lagu yang
// sedang diputar tanpa restart.

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  computeEffectiveMasterGain,
  type ReplayGainMode,
  type ReplayGainTags,
} from "../replaygain";

export type { ReplayGainMode, ReplayGainTags };

/** Tag dari field Song (yang dipersist di DB) — null bila belum ada. */
export function tagsFromSong(song: {
  replaygainTrackGainDb?: number;
  replaygainAlbumGainDb?: number;
  replaygainTrackPeak?: number;
  replaygainAlbumPeak?: number;
}): ReplayGainTags | null {
  const tags: ReplayGainTags = {};
  if (song.replaygainTrackGainDb !== undefined) {
    tags.trackGainDb = song.replaygainTrackGainDb;
  }
  if (song.replaygainAlbumGainDb !== undefined) {
    tags.albumGainDb = song.replaygainAlbumGainDb;
  }
  if (song.replaygainTrackPeak !== undefined) {
    tags.trackPeak = song.replaygainTrackPeak;
  }
  if (song.replaygainAlbumPeak !== undefined) {
    tags.albumPeak = song.replaygainAlbumPeak;
  }
  return tags.trackGainDb !== undefined ||
    tags.albumGainDb !== undefined ||
    tags.trackPeak !== undefined ||
    tags.albumPeak !== undefined
    ? tags
    : null;
}

export interface ReplayGainStore {
  /** ReplayGain menyala. Default OFF. */
  isReplayGainEnabled: boolean;
  /** Mode koreksi: per-track (default) atau per-album. */
  replayGainMode: ReplayGainMode;
  /** Lagu yang tag-nya sedang diterapkan (null = belum ada / RG mati). */
  currentSongId: string | null;
  /** Tag lagu aktif (null = tidak ada tag / RG mati). */
  currentTags: ReplayGainTags | null;
  /** Simpan niat user saja — dorongan ke native urusan pemanggil. */
  setReplayGainEnabled: (enabled: boolean) => void;
  setReplayGainMode: (mode: ReplayGainMode) => void;
  /** Tetapkan tag aktif untuk satu lagu (dipanggil `apply.ts`). */
  setCurrentTags: (songId: string | null, tags: ReplayGainTags | null) => void;
}

export const useReplayGainStore = create<ReplayGainStore>()(
  persist(
    (set) => ({
      isReplayGainEnabled: false,
      replayGainMode: "track",
      currentSongId: null,
      currentTags: null,

      setReplayGainEnabled: (enabled: boolean) => {
        set({ isReplayGainEnabled: enabled });
        if (!enabled) set({ currentSongId: null, currentTags: null });
      },

      setReplayGainMode: (mode: ReplayGainMode) => {
        set({ replayGainMode: mode });
      },

      setCurrentTags: (songId: string | null, tags: ReplayGainTags | null) => {
        set({ currentSongId: songId, currentTags: tags });
      },
    }),
    {
      name: "replaygain-storage",
      storage: createJSONStorage(() => AsyncStorage),
      // Hanya niat user yang dipersist; tag lagu aktif bersifat runtime
      // (di-resolve ulang per lagu dari DB/cache/file).
      partialize: (state) => ({
        isReplayGainEnabled: state.isReplayGainEnabled,
        replayGainMode: state.replayGainMode,
      }),
    },
  ),
);

/**
 * Gain linear efektif untuk master gain user — dipakai equalizerStore di
 * SEMUA jalur dorong ke native (slider, applyAllEffectsToNative, restore),
 * supaya tidak ada jalur yang menimpa RG diam-diam. RG mati / lagu tanpa
 * tag -> gain user apa adanya.
 */
export function getEffectiveMasterGain(userGainLinear: number): number {
  const { isReplayGainEnabled, replayGainMode, currentTags } =
    useReplayGainStore.getState();
  return computeEffectiveMasterGain(
    userGainLinear,
    currentTags,
    isReplayGainEnabled,
    replayGainMode,
  );
}

export default useReplayGainStore;
