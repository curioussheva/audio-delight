// src/hooks/useAudioPlayer.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import TrackPlayer, { 
  usePlaybackState,
  useProgress,
  State,
  Capability,
  Event
} from 'react-native-track-player';
import { useAudioStore } from '@store/audioStore';
import { Song } from '@/types/audio';

export const useAudioPlayer = () => {
  const isReady = useRef(false);
  const playbackState = usePlaybackState();
  const progress = useProgress();
  
  const currentSong = useAudioStore((state) => state.currentSong);
  const setPlayback = useAudioStore((state) => state.setPlayback);
  const setCurrentSong = useAudioStore((state) => state.setCurrentSong);

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
        console.error('Failed to setup TrackPlayer:', error);
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
      setPlayback({ isPlaying: true, isLoading: false });
    } catch (error) {
      console.error('Error loading song:', error);
      setPlayback({ isLoading: false });
    }
  }, []);

  // Play/Pause
  const play = useCallback(async () => {
    if (!isReady.current) return;
    await TrackPlayer.play();
    setPlayback({ isPlaying: true });
  }, []);

  const pause = useCallback(async () => {
    if (!isReady.current) return;
    await TrackPlayer.pause();
    setPlayback({ isPlaying: false });
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
    await TrackPlayer.seekTo(position * 1000); // Convert to milliseconds
  }, []);

  // Skip
  const skipToNext = useCallback(async () => {
    if (!isReady.current) return;
    await TrackPlayer.skipToNext();
    const queue = await TrackPlayer.getQueue();
    const currentTrack = await TrackPlayer.getCurrentTrack();
    if (currentTrack && queue[currentTrack]) {
      setCurrentSong(queue[currentTrack] as unknown as Song);
    }
  }, []);

  const skipToPrevious = useCallback(async () => {
    if (!isReady.current) return;
    await TrackPlayer.skipToPrevious();
    const queue = await TrackPlayer.getQueue();
    const currentTrack = await TrackPlayer.getCurrentTrack();
    if (currentTrack && queue[currentTrack]) {
      setCurrentSong(queue[currentTrack] as unknown as Song);
    }
  }, []);

  // Update playback state
  useEffect(() => {
    setPlayback({
      isPlaying: playbackState.state === State.Playing,
      position: progress.position,
      duration: progress.duration,
    });
  }, [playbackState.state, progress.position, progress.duration]);

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