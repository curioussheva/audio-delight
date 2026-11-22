import { useCallback } from "react";
import { shallow } from "zustand/shallow";
import { useLibraryStore } from "@/features/library/store/libraryStore";
import { selectFavorites } from "@/features/library/store/selectors";
import { Song } from "@/shared/types/audio";

/**
 * useFavorites — binding React untuk favorit.
 *
 * U-P1-17: dulu hook ini memelihara state lokal `favoriteIds` dari tabel
 * `favorites` terpisah (via FavoritesService), sementara Song Detail
 * menulis flag memori `libraryStore.toggleFavorite` — dua sumber
 * kebenaran yang tidak pernah sinkron. Sekarang hook ini TIDAK punya
 * state favorit sendiri: ia membaca cermin store (`libraryStore.tracks`,
 * yang dimuat dari kolom songs.isFavorite di DB) dan toggle-nya
 * mendelegasikan ke `libraryStore.toggleFavorite` (yang menulis DB lewat
 * LibraryScanner.toggleFavorite, penulis tunggal). Semua pembaca —
 * tab Songs, Song Detail, detail view, player — melihat nilai yang sama.
 */
export const useFavorites = () => {
  // Per-node render (2026-11-22): dulu hook ini melanggan SELURUH array
  // `tracks` + useMemo di atasnya — update track mana pun (enrichment,
  // rescan, toggle favorit lagu lain) mengganti identitas array dan
  // me-render ulang SEMUA pemakai hook ini (Player, Song Detail,
  // Playlist, tab Library) walau daftar favoritnya tidak berubah.
  // Sekarang selector turunan + `shallow`: array hasil filter hanya
  // dianggap berubah bila ISI-nya berubah (perbandingan per elemen,
  // referensi track dipertahankan updateTrack/toggleFavorite) — jadi
  // pemakai hanya bangun bila favoritnya sendiri berubah.
  const favoriteIds = useLibraryStore(
    (state) => state.tracks.filter((t) => t.isFavorite).map((t) => t.id),
    shallow,
  );
  const favoriteSongs = useLibraryStore(
    (state) => selectFavorites(state.tracks) as Song[],
    shallow,
  );
  const toggleFavoriteStore = useLibraryStore(
    (state) => state.toggleFavorite,
  );

  const toggleFavorite = useCallback(
    async (songId: string): Promise<boolean> => {
      toggleFavoriteStore(songId);
      return (
        useLibraryStore.getState().tracks.find((t) => t.id === songId)
          ?.isFavorite ?? false
      );
    },
    [toggleFavoriteStore],
  );

  const isFavorite = useCallback(
    (songId: string) => favoriteIds.includes(songId),
    [favoriteIds],
  );

  return {
    favoriteIds,
    favoriteSongs,
    loading: false,
    toggleFavorite,
    isFavorite,
    // Tidak ada lagi yang perlu di-refresh: store adalah cermin DB dan
    // setiap toggle menulis DB + store sekaligus. Disediakan supaya
    // pemanggil lama (refresh setelah scan) tidak pecah.
    refresh: async () => {},
  };
};
