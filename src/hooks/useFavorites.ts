import { useState, useEffect, useCallback } from "react";
import FavoritesService from "@/services/FavoritesService";
import { Song } from "@/types/audio";

export const useFavorites = (allSongs: Song[] = []) => {
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [favoriteSongs, setFavoriteSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(false);

  const loadFavorites = useCallback(async () => {
    setLoading(true);
    try {
      await FavoritesService.initialize();
      const ids = await FavoritesService.getAllFavorites();
      setFavoriteIds(ids);

      if (allSongs.length > 0) {
        const songs = allSongs.filter((song) => ids.includes(song.id));
        setFavoriteSongs(songs);
      }
    } catch (error) {
      console.error("Failed to load favorites:", error);
    } finally {
      setLoading(false);
    }
  }, [allSongs]);

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
        const song = allSongs.find((s) => s.id === songId);
        if (song) {
          setFavoriteSongs((prev) => [...prev, song]);
        }
      }

      return !isFav;
    },
    [favoriteIds, allSongs],
  );

  const isFavorite = useCallback(
    (songId: string) => {
      return favoriteIds.includes(songId);
    },
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
