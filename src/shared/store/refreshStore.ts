// src/shared/store/refreshStore.ts
//
// refreshKey global (Fase 4 redesign) — satu counter di store UI.
// Perubahan data menaikkan counter; layar yang perlu refresh berlangganan
// dan refresh dari SATU jalur terkoordinasi (bukan pemicu sendiri-sendiri
// seperti dulu: dua listener AppState di library.tsx + useScanManager
// yang masing-masing punya penjaga sendiri).
//
// `lastReason` dicatat supaya pelanggan bisa memfilter: refresh daftar
// lagu hanya untuk "resume" / "manual-scan"; reload playlist hanya untuk
// "playlist-change". `lastOrigin` membedakan SIAPA yang mengubah data —
// pelanggan melewatkan bump yang berasal dari dirinya sendiri (datanya
// sudah diperbarui lokal, reload ulang hanya buang baca DB).
//
// Store ini TIDAK dipersist (pola yang sama dengan toastStore):
// refreshKey adalah sinyal sesi, bukan data yang harus hidup antar
// launch — nilai rehydrate yang basi hanya akan memicu satu refresh
// sia-sia saat layar pertama kali mount.
import { create } from "zustand";

/** Alasan bump — pelanggan memfilter berdasarkan ini (refreshPolicy.ts). */
export type LibraryRefreshReason =
  | "resume"
  | "manual-scan"
  | "playlist-change";

interface RefreshStore {
  /** Counter — naik 1 tiap ada perubahan data yang perlu refresh. */
  refreshKey: number;
  /** Alasan bump terakhir; null sebelum ada bump. */
  lastReason: LibraryRefreshReason | null;
  /** Siapa yang mem-bump (id instance pemanggil); null bila tak tercatat. */
  lastOrigin: string | null;
  bumpRefreshKey: (
    reason: LibraryRefreshReason,
    origin?: string | null,
  ) => void;
}

export const useRefreshStore = create<RefreshStore>()((set) => ({
  refreshKey: 0,
  lastReason: null,
  lastOrigin: null,
  bumpRefreshKey: (reason, origin = null) =>
    set((state) => ({
      refreshKey: state.refreshKey + 1,
      lastReason: reason,
      lastOrigin: origin,
    })),
}));
