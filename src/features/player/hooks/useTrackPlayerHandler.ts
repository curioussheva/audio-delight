import { useCallback, useRef } from "react";
import { usePlayerStore } from "../store/playerStore";
import { Song } from "@/shared/types/audio";
import NativePlaybackService from "@/specs/NativePlaybackService";

export const useTrackPlayerHandler = () => {
  const {
    currentSong,
    setCurrentSong,
    setIsPlaying,
    setPosition,
    setDuration,
  } = usePlayerStore();

  const isInitializedRef = useRef(false);

  const initialize = useCallback(async () => {
    if (isInitializedRef.current) return;
    try {
      NativePlaybackService.startService();
      isInitializedRef.current = true;
      console.log("[PlaybackService] initialized");
    } catch (error) {
      console.error("[PlaybackService] init failed:", error);
    }
  }, []);

  const playSong = useCallback(
    async (song: Song, queueSongs?: Song[]) => {
      await initialize();

      const playQueue = queueSongs || [song];
      const uris = playQueue.map((s) => s.uri).filter(Boolean);

      if (uris.length === 0) {
        console.error("[PlaybackService] No valid URIs");
        return false;
      }

      NativePlaybackService.setQueue(uris);
      NativePlaybackService.play();

      setCurrentSong(song);
      setIsPlaying(true);
      setDuration(song.duration || 0);
      setPosition(0);

      return true;
    },
    [initialize, setCurrentSong, setIsPlaying, setDuration, setPosition],
  );

  const togglePlay = useCallback(async () => {
    await initialize();
    const status = NativePlaybackService.getStatus();
    if (status === 1) {
      NativePlaybackService.pause();
      setIsPlaying(false);
    } else {
      NativePlaybackService.play();
      setIsPlaying(true);
    }
  }, [initialize, setIsPlaying]);

  const seek = useCallback(async (position: number) => {
    await initialize();
    NativePlaybackService.seek(position * 1000);
    setPosition(position);
  }, [initialize, setPosition]);

  const playNext = useCallback(async () => {
    await initialize();
    NativePlaybackService.next();
  }, [initialize]);

  const playPrevious = useCallback(async () => {
    await initialize();
    NativePlaybackService.previous();
  }, [initialize]);

  const getPlaybackState = useCallback(async () => {
    await initialize();
    return { state: NativePlaybackService.getStatus() };
  }, [initialize]);

  return {
    playSong,
    togglePlay,
    seek,
    playNext,
    playPrevious,
    getPlaybackState,
    initialize,
  };
};