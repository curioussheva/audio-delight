import { create } from 'zustand';
import { Track, PlaybackState } from '../types/audio.types';

interface PlayerState {
  currentTrack: Track | null;
  queue: Track[];
  playbackState: PlaybackState;
  position: number;
  duration: number;
  setCurrentTrack: (t: Track | null) => void;
  setQueue: (t: Track[]) => void;
  setPlaybackState: (s: PlaybackState) => void;
  setProgress: (p: number, d: number) => void;
  playTrack: (t: Track, q?: Track[]) => Promise<void>;
  togglePlayPause: () => Promise<void>;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentTrack: null,
  queue: [],
  playbackState: 'idle',
  position: 0,
  duration: 0,
  setCurrentTrack: (t) => set({ currentTrack: t }),
  setQueue: (q) => set({ queue: q }),
  setPlaybackState: (s) => set({ playbackState: s }),
  setProgress: (p, d) => set({ position: p, duration: d }),
  playTrack: async (track, queue) => {
    const tracks = queue ?? get().queue;
    set({ currentTrack: track, queue: tracks, playbackState: 'playing' });
  },
  togglePlayPause: async () => {
    const s = get().playbackState;
    set({ playbackState: s === 'playing' ? 'paused' : 'playing' });
  },
}));
