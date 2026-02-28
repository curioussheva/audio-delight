/**
 * usePlayerStore — Week 2
 * Connected to AudioPlayer (expo-av) + AudioEngine (mock FFT)
 */
import { create } from 'zustand';
import { Track, PlaybackState } from '../types/audio.types';
import AudioPlayer from '../services/AudioPlayer';
import AudioEngine from '../audio/AudioEngine';

interface PlayerState {
  currentTrack: Track | null;
  queue: Track[];
  playbackState: PlaybackState;
  position: number;
  duration: number;
  volume: number;
  repeatMode: 'off' | 'track' | 'queue';
  isInitialized: boolean;

  init: () => Promise<void>;
  playTrack: (track: Track, queue?: Track[]) => Promise<void>;
  togglePlayPause: () => Promise<void>;
  skipToNext: () => Promise<void>;
  skipToPrevious: () => Promise<void>;
  seekTo: (seconds: number) => Promise<void>;
  setVolume: (vol: number) => void;
  setRepeatMode: (mode: 'off' | 'track' | 'queue') => void;

  // Internal setters (called by AudioPlayer callbacks)
  _setProgress: (pos: number, dur: number) => void;
  _setState: (state: PlaybackState) => void;
  _setTrack: (track: Track) => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => {
  // Wire up AudioPlayer callbacks → Zustand state
  AudioPlayer.setOnProgress((pos, dur) => {
    get()._setProgress(pos, dur);
  });
  AudioPlayer.setOnStateChange((state) => {
    get()._setState(state as PlaybackState);
  });
  AudioPlayer.setOnTrackChange((track) => {
    get()._setTrack(track);
  });

  return {
    currentTrack: null,
    queue: [],
    playbackState: 'idle',
    position: 0,
    duration: 0,
    volume: 1.0,
    repeatMode: 'off',
    isInitialized: false,

    init: async () => {
      if (get().isInitialized) return;
      await AudioPlayer.setup();
      await AudioEngine.init();
      set({ isInitialized: true });
    },

    playTrack: async (track, queue) => {
      const tracks = queue ?? get().queue;
      AudioPlayer.setQueue(tracks, tracks.findIndex(t => t.id === track.id));
      set({ queue: tracks });
      await AudioPlayer.play(track);
    },

    togglePlayPause: async () => {
      const state = get().playbackState;
      if (state === 'playing') {
        await AudioPlayer.pause();
      } else if (state === 'paused') {
        await AudioPlayer.play();
      }
    },

    skipToNext: async () => {
      await AudioPlayer.skipToNext();
    },

    skipToPrevious: async () => {
      await AudioPlayer.skipToPrevious();
    },

    seekTo: async (seconds) => {
      await AudioPlayer.seekTo(seconds);
      set({ position: seconds });
    },

    setVolume: (vol) => {
      set({ volume: vol });
      AudioPlayer.setVolume(vol);
    },

    setRepeatMode: (mode) => {
      set({ repeatMode: mode });
      AudioPlayer.setRepeatMode(mode);
    },

    _setProgress: (pos, dur) => set({ position: pos, duration: dur }),
    _setState: (state) => set({ playbackState: state }),
    _setTrack: (track) => set({ currentTrack: track }),
  };
});
