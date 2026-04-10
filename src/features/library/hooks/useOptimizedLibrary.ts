import { useMemo } from "react";
import { useLibrary } from "./useLibrary";
import { useFavorites } from "@/features/favorites/hooks/useFavorites";
import { Song } from "@/shared/types/audio";

interface UseOptimizedLibraryOptions {
  searchQuery: string;
  filterBy: string;
  sortBy?: string;
}

export const useOptimizedLibrary = ({
  searchQuery,
  filterBy,
  sortBy = "title-asc",
}: UseOptimizedLibraryOptions) => {
  const { songs, loading, reload } = useLibrary();
  const { isFavorite, toggleFavorite, favoriteSongs } = useFavorites();

  const processedSongs = useMemo(() => {
    // 1. Inisialisasi dengan menyalin array
    let result = [...songs];

    // 2. Search filter (Case-insensitive)
    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.artist.toLowerCase().includes(q) ||
          (s.album && s.album.toLowerCase().includes(q)),
      );
    }

    // 3. Category filter
    switch (filterBy) {
      case "favorites":
        // Tips: Menggunakan daftar ID favorit lebih stabil daripada fungsi isFavorite di dependency
        result = result.filter((s) => isFavorite(s.id));
        break;
      case "format-flac":
        result = result.filter((s) => s.codec?.toUpperCase() === "FLAC");
        break;
      case "sample-rate-hi-res":
        // Hi-Res biasanya di atas 48kHz atau bit depth > 16
        result = result.filter(
          (s) => (s.sampleRate || 0) > 48000 || (s.bitDepth || 0) > 16,
        );
        break;
      case "recently-added":
        const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        result = result.filter((s) => (s.dateAdded || 0) > weekAgo);
        break;
    }

    // 4. Sort Strategies
    const sortFn = (a: Song, b: Song): number => {
      switch (sortBy) {
        case "title-desc":
          return b.title.localeCompare(a.title);
        case "artist-asc":
          return a.artist.localeCompare(b.artist);
        case "album-asc":
          return (a.album || "").localeCompare(b.album || "");
        case "duration-desc":
          return (b.duration || 0) - (a.duration || 0);
        case "duration-asc":
          return (a.duration || 0) - (b.duration || 0);
        case "date-added-desc":
          return (b.dateAdded || 0) - (a.dateAdded || 0);
        case "play-count-desc":
          return (b.playCount || 0) - (a.playCount || 0);
        case "title-asc":
        default:
          return a.title.localeCompare(b.title);
      }
    };

    return result.sort(sortFn);

    // Gunakan 'favorites' sebagai dependency alih-alih fungsi 'isFavorite'
  }, [songs, searchQuery, filterBy, sortBy, favoriteSongs]);

  return {
    songs: processedSongs,
    loading,
    reload,
    isFavorite,
    toggleFavorite,
  };
};
