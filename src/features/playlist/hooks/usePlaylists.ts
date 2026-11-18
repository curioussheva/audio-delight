// src/hooks/usePlaylists.ts
import { useState, useEffect, useCallback } from "react";
import PlaylistService from "@/features/playlist/api/service";
import { Playlist, CreatePlaylistDTO } from "@/features/playlist/types";
import { Song } from "@/shared/types/audio";
import { shouldReloadPlaylistsOnBump } from "@/features/library/services/refreshPolicy";
import { useRefreshStore } from "@/shared/store/refreshStore";

// FASE 4: hook ini dipakai DUA layar (tab playlist Library + drawer
// Playlist) dengan state lokal MASING-MASING — bukan store bersama.
// Perubahan playlist di satu layar dulu tidak terlihat di layar lain
// sampai layar itu remount. Sekarang tiap mutasi me-bump refreshKey
// ("playlist-change"); instance lain me-reload dari DB, instance yang
// mengubah melewatkan bump-nya sendiri (datanya sudah update lokal).
// Id instance stabil per mount (lazy useState — bukan useRef dengan
// ekspresi yang dievaluasi tiap render).
let nextPlaylistInstanceId = 1;

export const usePlaylists = () => {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [instanceId] = useState(
    () => `playlists-${nextPlaylistInstanceId++}`,
  );

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
      useRefreshStore
        .getState()
        .bumpRefreshKey("playlist-change", instanceId);
      return newPlaylist;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, [instanceId]);

  const addToPlaylist = useCallback(
    async (playlistId: string, songs: Song[]) => {
      try {
        await PlaylistService.addToPlaylist(
          playlistId,
          songs.map((s) => s.id),
        );
        await loadPlaylists();
        useRefreshStore
          .getState()
          .bumpRefreshKey("playlist-change", instanceId);
      } catch (err: any) {
        setError(err.message);
        // N7: lempar ulang seperti createPlaylist — pemanggil harus tahu
        // tulis gagal supaya tidak toast sukses / menutup layar.
        throw err;
      }
    },
    [loadPlaylists, instanceId],
  );

  const removeFromPlaylist = useCallback(
    async (playlistId: string, songId: string) => {
      try {
        await PlaylistService.removeFromPlaylist(playlistId, songId);
        await loadPlaylists();
        useRefreshStore
          .getState()
          .bumpRefreshKey("playlist-change", instanceId);
      } catch (err: any) {
        setError(err.message);
        // N7: lempar ulang — lihat addToPlaylist.
        throw err;
      }
    },
    [loadPlaylists, instanceId],
  );

  const deletePlaylist = useCallback(async (id: string) => {
    try {
      await PlaylistService.deletePlaylist(id);
      setPlaylists((prev) => prev.filter((p) => p.id !== id));
      useRefreshStore
        .getState()
        .bumpRefreshKey("playlist-change", instanceId);
    } catch (err: any) {
      setError(err.message);
      // N7: lempar ulang — lihat addToPlaylist.
      throw err;
    }
  }, [instanceId]);

  // Import dari isi mentah file M3U (raw string content, belum di-parse).
  // B1 (ronde 9): dulu objek hasil import di-append langsung ke state
  // — padahal `songs`-nya [] (lihat createPlaylist di service) — jadi
  // detail playlist tampil "0 track" sampai relaunch. Sekarang reload
  // dari DB (getAllPlaylists mengisi `songs` lewat JOIN), pola yang
  // sama dengan addToPlaylist/removeFromPlaylist di hook ini.
  const importM3U = useCallback(async (content: string) => {
    try {
      const newPlaylist = await PlaylistService.importM3U(content);
      await loadPlaylists();
      useRefreshStore
        .getState()
        .bumpRefreshKey("playlist-change", instanceId);
      return newPlaylist;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, [loadPlaylists, instanceId]);

  // Import dari hasil parseM3U() — array path lagu yang sudah di-parse,
  // dipakai oleh handleImportM3U di playlist.tsx.
  // B1 (ronde 9): reload setelah import — lihat komentar di importM3U.
  const importM3UPaths = useCallback(
    async (name: string, paths: string[], description?: string) => {
      try {
        const newPlaylist = await PlaylistService.importM3UPaths(
          name,
          paths,
          description,
        );
        await loadPlaylists();
        useRefreshStore
          .getState()
          .bumpRefreshKey("playlist-change", instanceId);
        return newPlaylist;
      } catch (err: any) {
        setError(err.message);
        throw err;
      }
    },
    [loadPlaylists, instanceId],
  );

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

  // FASE 4: berlangganan refreshKey — reload dari DB bila playlist
  // berubah di instance LAIN (tab Library vs drawer Playlist).
  // Bump sendiri dilewat (refreshPolicy): state lokal sudah benar.
  // Key 0 = belum ada bump: jangan reload dobel saat mount.
  const refreshKey = useRefreshStore((s) => s.refreshKey);
  useEffect(() => {
    if (refreshKey === 0) return;
    const { lastReason, lastOrigin } = useRefreshStore.getState();
    if (!shouldReloadPlaylistsOnBump(lastReason, lastOrigin, instanceId)) {
      return;
    }
    void loadPlaylists();
  }, [refreshKey, instanceId, loadPlaylists]);

  return {
    playlists,
    loading,
    error,
    createPlaylist,
    addToPlaylist,
    removeFromPlaylist,
    deletePlaylist,
    importM3U,
    importM3UPaths,
    exportM3U,
    refresh: loadPlaylists,
  };
};
 