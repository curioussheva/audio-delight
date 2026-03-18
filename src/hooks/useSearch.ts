import { useState, useMemo } from "react";
import { Song } from "@/types/audio";

export const useSearch = (songs: Song[]) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterBy, setFilterBy] = useState<"title" | "artist" | "album">(
    "title",
  );
  const [sortBy, setSortBy] = useState<"title" | "artist" | "duration">(
    "title",
  );
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const filteredSongs = useMemo(() => {
    if (!searchQuery.trim()) return songs;

    const query = searchQuery.toLowerCase();
    return songs.filter((song) => {
      switch (filterBy) {
        case "title":
          return song.title.toLowerCase().includes(query);
        case "artist":
          return song.artist.toLowerCase().includes(query);
        case "album":
          return song.album?.toLowerCase().includes(query) || false;
        default:
          return true;
      }
    });
  }, [songs, searchQuery, filterBy]);

  const sortedSongs = useMemo(() => {
    return [...filteredSongs].sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case "title":
          comparison = a.title.localeCompare(b.title);
          break;
        case "artist":
          comparison = a.artist.localeCompare(b.artist);
          break;
        case "duration":
          comparison = a.duration - b.duration;
          break;
      }

      return sortOrder === "asc" ? comparison : -comparison;
    });
  }, [filteredSongs, sortBy, sortOrder]);

  return {
    searchQuery,
    setSearchQuery,
    filterBy,
    setFilterBy,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    results: sortedSongs,
  };
};
