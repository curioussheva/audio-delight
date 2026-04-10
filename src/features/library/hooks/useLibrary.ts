// src/features/library/hooks/useLibrary.ts

import { useState, useEffect, useCallback, useRef } from "react";
import { LibraryScanner } from "@/features/library/api/scanner";
import { useLibraryStore } from "@/features/library/store/libraryStore";
import { Song } from "@/shared/types/audio";

interface UseLibraryOptions {
  autoLoad?: boolean;
  searchQuery?: string;
  filterBy?: "all" | "lossless" | "lossy" | "hi-res";
  sortBy?:
    | "title-asc"
    | "title-desc"
    | "artist-asc"
    | "date-added"
    | "play-count";
  limit?: number;
  offset?: number;
}

interface UseLibraryReturn {
  songs: Song[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  loadMore: () => Promise<void>;
  hasMore: boolean;
  total: number;
  refresh: () => Promise<void>;
  getSongById: (id: string) => Song | undefined;
  getSongByUri: (uri: string) => Song | undefined;
}

// Global cache untuk mencegah multiple loading
let globalLoadingPromise: Promise<void> | null = null;
let globalSongsCache: Song[] | null = null;
let lastLoadTime = 0;
const CACHE_DURATION = 5000; // 5 detik cache

export const useLibrary = (
  options: UseLibraryOptions = {},
): UseLibraryReturn => {
  const {
    autoLoad = true,
    searchQuery = "",
    filterBy = "all",
    sortBy = "title-asc",
    limit = 1000,
    offset = 0,
  } = options;

  const [songs, setSongs] = useState<Song[]>(globalSongsCache || []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);
  const [currentOffset, setCurrentOffset] = useState(offset);

  const setTracks = useLibraryStore((s) => s.setTracks);
  const isMountedRef = useRef(true);
  const loadIdRef = useRef(0);

  // Load songs dengan cache dan deduplication
  const loadSongs = useCallback(
    async (
      isLoadMore = false,
      newSearchQuery?: string,
      newFilterBy?: string,
      newSortBy?: string,
    ) => {
      const currentLoadId = ++loadIdRef.current;
      const currentSearch = newSearchQuery ?? searchQuery;
      const currentFilter = newFilterBy ?? filterBy;
      const currentSort = newSortBy ?? sortBy;
      const loadOffset = isLoadMore ? currentOffset : 0;

      // Cek cache untuk initial load (bukan load more)
      const now = Date.now();
      if (
        !isLoadMore &&
        globalSongsCache &&
        now - lastLoadTime < CACHE_DURATION
      ) {
        if (isMountedRef.current) {
          setSongs(globalSongsCache);
          setLoading(false);
        }
        return;
      }

      // Jika sudah ada promise yang berjalan, tunggu
      if (globalLoadingPromise && !isLoadMore) {
        await globalLoadingPromise;
        if (isMountedRef.current && globalSongsCache) {
          setSongs(globalSongsCache);
        }
        return;
      }

      if (!isLoadMore) {
        setLoading(true);
      }
      setError(null);

      // Buat promise baru
      globalLoadingPromise = (async () => {
        try {
          const result = await LibraryScanner.getLibrarySongs({
            searchQuery: currentSearch,
            filterBy: currentFilter as any,
            sortBy: currentSort as any,
            limit,
            offset: loadOffset,
          });

          if (currentLoadId !== loadIdRef.current) return;
          if (!isMountedRef.current) return;

          if (isLoadMore) {
            setSongs((prev) => {
              const newSongs = [...prev, ...result];
              // Update cache untuk initial load
              if (!currentSearch && currentFilter === "all") {
                globalSongsCache = newSongs;
                lastLoadTime = Date.now();
              }
              return newSongs;
            });
          } else {
            setSongs(result);
            // Update global cache
            globalSongsCache = result;
            lastLoadTime = Date.now();
            // Sync ke store
            if (result.length > 0) {
              setTracks(result as any);
            }
          }

          setHasMore(result.length === limit);
          setCurrentOffset(loadOffset + result.length);

          const stats = await LibraryScanner.getLibraryStats();
          setTotal(stats.totalSongs);
        } catch (error: any) {
          if (currentLoadId !== loadIdRef.current) return;
          if (isMountedRef.current) {
            setError(error?.message || "Gagal memuat lagu dari database");
          }
        } finally {
          if (currentLoadId === loadIdRef.current && isMountedRef.current) {
            if (!isLoadMore) {
              setLoading(false);
            }
            globalLoadingPromise = null;
          }
        }
      })();

      await globalLoadingPromise;
    },
    [searchQuery, filterBy, sortBy, limit, currentOffset, setTracks],
  );

  const loadMore = useCallback(async () => {
    if (!hasMore || loading || globalLoadingPromise) return;
    await loadSongs(true);
  }, [hasMore, loading, loadSongs]);

  const reload = useCallback(async () => {
    // Invalidate cache
    globalSongsCache = null;
    setCurrentOffset(0);
    setHasMore(true);
    await loadSongs(false);
  }, [loadSongs]);

  const refresh = useCallback(async () => {
    await reload();
  }, [reload]);

  const getSongById = useCallback(
    (id: string): Song | undefined => {
      return songs.find((song) => song.id === id);
    },
    [songs],
  );

  const getSongByUri = useCallback(
    (uri: string): Song | undefined => {
      return songs.find((song) => song.uri === uri);
    },
    [songs],
  );

  // Auto-load on mount
  useEffect(() => {
    if (autoLoad && songs.length === 0 && !globalLoadingPromise) {
      loadSongs(false);
    }
  }, []); // Empty deps, run once

  // Reload when filters change
  useEffect(() => {
    if (
      autoLoad &&
      (searchQuery || filterBy !== "all" || sortBy !== "title-asc")
    ) {
      // Reset cache and reload
      globalSongsCache = null;
      setCurrentOffset(0);
      setHasMore(true);
      loadSongs(false);
    }
  }, [searchQuery, filterBy, sortBy]);

  // Cleanup
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return {
    songs,
    loading,
    error,
    reload,
    loadMore,
    hasMore,
    total,
    refresh,
    getSongById,
    getSongByUri,
  };
};
