import { useState, useEffect, useCallback, useRef } from "react";
import FavoritesService from "@/features/favorites/api/service";
import { Song } from "@/shared/types/audio";

export const useFavorites = (allSongs: Song[] = []) => {
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [favoriteSongs, setFavoriteSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(false);
  const allSongsRef = useRef(allSongs);

  // Update ref tanpa trigger re-render
  useEffect(() => {
    allSongsRef.current = allSongs;
  }, [allSongs]);

  // Load IDs sekali saja — tidak depend on allSongs
  const loadFavorites = useCallback(async () => {
    setLoading(true);
    try {
      await FavoritesService.initialize();
      const ids = await FavoritesService.getAllFavorites();
      setFavoriteIds(ids);

      const songs = allSongsRef.current.filter((song) => ids.includes(song.id));
      setFavoriteSongs(songs);
    } catch (error) {
      console.error("Failed to load favorites:", error);
    } finally {
      setLoading(false);
    }
  }, []); // ← kosong, tidak recreate setiap render

  // Sync favoriteSongs jika allSongs berubah (lagu baru di-scan)
  useEffect(() => {
    if (favoriteIds.length > 0 && allSongs.length > 0) {
      setFavoriteSongs(allSongs.filter((song) => favoriteIds.includes(song.id)));
    }
  }, [allSongs, favoriteIds]);

  const toggleFavorite = useCallback(
    async (songId: string) => {
      const isFav = favoriteIds.includes(songId);
      if (isFav) {
        await FavoritesService.removeFavorite(songId);
        setFavoriteIds((prev) => prev.filter((id) => id !== songId));
        setFavoriteSongs((prev) => prev.filter((s) => s.id !== songId));
      } else {
        await FavoritesService.addFavorite(songId);
        setFavoriteIds((prev) => [...prev, songId]);
        const song = allSongsRef.current.find((s) => s.id === songId);
        if (song) setFavoriteSongs((prev) => [...prev, song]);
      }
      return !isFav;
    },
    [favoriteIds],
  );

  const isFavorite = useCallback(
    (songId: string) => favoriteIds.includes(songId),
    [favoriteIds],
  );

  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

  return {
    favoriteIds,
    favoriteSongs,
    loading,
    toggleFavorite,
    isFavorite,
    refresh: loadFavorites,
  };
}; 