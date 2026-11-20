/**
 * refreshPolicy.ts — Fase 4: kebijakan MURNI untuk jalur refreshKey.
 *
 * Keputusan "bump ini untukku atau bukan" tinggal di sini supaya bisa
 * diuji jest (jest proyek ini hanya logika murni, tanpa react-native)
 * dan supaya pelanggan (Library, usePlaylists) tidak mengarang filternya
 * sendiri-sendiri — satu bump, satu arti, di semua layar.
 *
 * - Daftar lagu hanya berubah oleh scan/resume: "resume" (diff MediaStore
 *   sudah ditulis dulu oleh koordinator foreground) dan "manual-scan"
 *   (scan selesai). Perubahan playlist TIDAK mengubah daftar lagu.
 * - Daftar playlist hanya berubah oleh "playlist-change" — dan instance
 *   yang mengubahnya sendiri tidak perlu reload (ia sudah memperbarui
 *   state lokalnya di fungsi mutasi; reload ulang hanya baca DB sia-sia).
 * - Refresh daftar lagu di tengah scan dilewat: pembacaan DB saat tulis
 *   diff berjalan bisa mengembalikan daftar sebagian/kosong (transaksi
 *   tulis per 20 lagu) — bump penutup scan yang akan me-refresh.
 */
import type { LibraryRefreshReason } from "@/shared/store/refreshStore";

/** Apakah bump ini harus me-refresh daftar lagu (Library)? */
export function shouldRefreshLibraryOnBump(
  reason: LibraryRefreshReason | null,
): boolean {
  return reason === "resume" || reason === "manual-scan";
}

/** Apakah bump ini harus me-reload daftar playlist di instance ini? */
export function shouldReloadPlaylistsOnBump(
  reason: LibraryRefreshReason | null,
  origin: string | null,
  ownOrigin: string,
): boolean {
  return reason === "playlist-change" && origin !== ownOrigin;
}

/** Apakah bump ini harus me-reload ringkasan smart playlist?
 *  Isi smart playlist hanya bergantung pada tabel `songs` (dateAdded /
 *  playCount / codec), jadi hanya bump yang mengubah daftar lagu
 *  (resume / manual-scan) yang relevan. "playlist-change" TIDAK
 *  mengubah isi smart playlist — playlist manual berubah, lagu tidak.
 *  Perubahan playCount saat lagu diputar TIDAK me-bump refreshKey:
 *  isi detail smart playlist tetap segar karena dibaca dari SQLite
 *  saat barisnya ditekan (getSmartPlaylist), bukan dari ringkasan ini. */
export function shouldReloadSmartPlaylistsOnBump(
  reason: LibraryRefreshReason | null,
): boolean {
  return shouldRefreshLibraryOnBump(reason);
}

/** Apakah ada scan yang sedang berjalan (manual atau auto)? */
export function isLibraryScanRunning(state: {
  isManualScanning: boolean;
  isAutoScanning: boolean;
}): boolean {
  return state.isManualScanning || state.isAutoScanning;
}
