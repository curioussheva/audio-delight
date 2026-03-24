// src/hooks/usePlaylists.ts
import { useState, useEffect, useCallback } from "react";
import PlaylistService from "@/features/playlist/api/service";
import { Playlist, CreatePlaylistDTO } from "@/features/playlist/types";
import { Song } from "@/shared/types/audio";

export const usePlaylists = () => {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPlaylists = useCallback(async () => {
    setLoading(true);
    try {
      await PlaylistService.initialize();
      const data = await PlaylistService.getAllPlaylists();
      setPlaylists(data);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const createPlaylist = useCallback(async (dto: CreatePlaylistDTO) => {
    try {
      const newPlaylist = await PlaylistService.createPlaylist(dto);
      setPlaylists((prev) => [...prev, newPlaylist]);
      return newPlaylist;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, []);

  const addToPlaylist = useCallback(
    async (playlistId: string, songs: Song[]) => {
      try {
        await PlaylistService.addToPlaylist(
          playlistId,
          songs.map((s) => s.id),
        );
        await loadPlaylists();
      } catch (err: any) {
        setError(err.message);
      }
    },
    [loadPlaylists],
  );

  const removeFromPlaylist = useCallback(
    async (playlistId: string, songId: string) => {
      try {
        await PlaylistService.removeFromPlaylist(playlistId, songId);
        await loadPlaylists();
      } catch (err: any) {
        setError(err.message);
      }
    },
    [loadPlaylists],
  );

  const deletePlaylist = useCallback(async (id: string) => {
    try {
      await PlaylistService.deletePlaylist(id);
      setPlaylists((prev) => prev.filter((p) => p.id !== id));
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  const importM3U = useCallback(async (content: string) => {
    try {
      const newPlaylist = await PlaylistService.importM3U(content);
      setPlaylists((prev) => [...prev, newPlaylist]);
      return newPlaylist;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, []);

  const exportM3U = useCallback(async (playlist: Playlist) => {
    try {
      return await PlaylistService.exportM3U(playlist);
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, []);

  useEffect(() => {
    loadPlaylists();
  }, []);

  return {
    playlists,
    loading,
    error,
    createPlaylist,
    addToPlaylist,
    removeFromPlaylist,
    deletePlaylist,
    importM3U,
    exportM3U,
    refresh: loadPlaylists,
  };
};
