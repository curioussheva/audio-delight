import { useCallback, useMemo } from "react";
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
  const tracks = useLibraryStore((state) => state.tracks);
  const toggleFavoriteStore = useLibraryStore(
    (state) => state.toggleFavorite,
  );

  // Daftar ID favorit — identitas stabil selama tracks tidak berubah.
  const favoriteIds = useMemo(
    () => tracks.filter((t) => t.isFavorite).map((t) => t.id),
    [tracks],
  );

  const favoriteSongs: Song[] = useMemo(
    () => selectFavorites(tracks) as Song[],
    [tracks],
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
