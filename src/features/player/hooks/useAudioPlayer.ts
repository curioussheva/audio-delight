// src/hooks/useAudioPlayer.ts
import { useEffect, useCallback, useRef } from "react";
import TrackPlayer, {
  usePlaybackState,
  useProgress,
  State,
  Capability,
} from "react-native-track-player";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { Song } from "@/shared/types/audio";

export const useAudioPlayer = () => {
  const isReady = useRef(false);
  const playbackState = usePlaybackState();
  const progress = useProgress();

  // ✅ Ambil dari playerStore
  const setCurrentSong = usePlayerStore((state) => state.setCurrentSong);
  const setIsPlaying = usePlayerStore((state) => state.setIsPlaying);
  const setPosition = usePlayerStore((state) => state.setPosition);
  const setDuration = usePlayerStore((state) => state.setDuration);
  const playNext = usePlayerStore((state) => state.playNext);
  const playPrevious = usePlayerStore((state) => state.playPrevious);

  // Setup Track Player
  useEffect(() => {
    const setupPlayer = async () => {
      if (isReady.current) return;

      try {
        await TrackPlayer.setupPlayer({
          autoHandleInterruptions: true,
        });

        await TrackPlayer.updateOptions({
          capabilities: [
            Capability.Play,
            Capability.Pause,
            Capability.SkipToNext,
            Capability.SkipToPrevious,
            Capability.Stop,
            Capability.SeekTo,
          ],
          compactCapabilities: [
            Capability.Play,
            Capability.Pause,
            Capability.SkipToNext,
            Capability.SkipToPrevious,
          ],
          notificationCapabilities: [
            Capability.Play,
            Capability.Pause,
            Capability.SkipToNext,
            Capability.SkipToPrevious,
          ],
        });

        isReady.current = true;
      } catch (error) {
        console.error("Failed to setup TrackPlayer:", error);
      }
    };

    setupPlayer();

    return () => {
      if (isReady.current) {
        TrackPlayer.reset();
      }
    };
  }, []);

  // Load and play song
  const loadSong = useCallback(async (song: Song) => {
    try {
      if (!isReady.current) return;

      await TrackPlayer.reset();
      await TrackPlayer.add({
        id: song.id,
        url: song.uri,
        title: song.title,
        artist: song.artist,
        artwork: song.artwork,
        duration: song.duration,
      });

      await TrackPlayer.play();
      setCurrentSong(song);
      setIsPlaying(true); // ✅
    } catch (error) {
      console.error("Error loading song:", error);
    }
  }, []);

  // Play/Pause
  const play = useCallback(async () => {
    if (!isReady.current) return;
    await TrackPlayer.play();
    setIsPlaying(true); // ✅
  }, []);

  const pause = useCallback(async () => {
    if (!isReady.current) return;
    await TrackPlayer.pause();
    setIsPlaying(false); // ✅
  }, []);

  const togglePlayPause = useCallback(async () => {
    if (!isReady.current) return;
    const state = await TrackPlayer.getPlaybackState();
    if (state.state === State.Playing) {
      await pause();
    } else {
      await play();
    }
  }, [play, pause]);

  // Seek
  const seek = useCallback(async (position: number) => {
    if (!isReady.current) return;
    await TrackPlayer.seekTo(position * 1000);
  }, []);

  // Skip
  const skipToNext = useCallback(async () => {
    if (!isReady.current) return;
    await TrackPlayer.skipToNext();
    playNext(); // ✅ panggil dari store
  }, [playNext]);

  const skipToPrevious = useCallback(async () => {
    if (!isReady.current) return;
    await TrackPlayer.skipToPrevious();
    playPrevious(); // ✅ panggil dari store
  }, [playPrevious]);

  // Update playback state dari progress ke store
  useEffect(() => {
    setPosition(progress.position);
    setDuration(progress.duration);
    setIsPlaying(playbackState.state === State.Playing);
  }, [
    playbackState.state,
    progress.position,
    progress.duration,
    setPosition,
    setDuration,
    setIsPlaying,
  ]);

  return {
    loadSong,
    play,
    pause,
    togglePlayPause,
    seek,
    skipToNext,
    skipToPrevious,
    isPlaying: playbackState.state === State.Playing,
    position: progress.position,
    duration: progress.duration,
    isLoading: !isReady.current,
  };
};
