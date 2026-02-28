import { create } from 'zustand';
import TrackPlayer, {
  State, Event, RepeatMode,
  usePlaybackState, useProgress, useActiveTrack,
} from 'react-native-track-player';
import { Track, PlaybackState } from '../types/audio.types';

function rnState(s: State | undefined): PlaybackState {
  switch (s) {
    case State.Playing: return 'playing';
    case State.Paused: return 'paused';
    case State.Loading:
    case State.Buffering: return 'loading';
    case State.Stopped: return 'stopped';
    default: return 'idle';
  }
}

interface PlayerState {
  currentTrack: Track | null;
  queue: Track[];
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
  setCurrentTrack: (track: Track | null) => void;
  setQueue: (tracks: Track[]) => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentTrack: null,
  queue: [],
  repeatMode: 'off',
  isInitialized: false,

  init: async () => {
    if (get().isInitialized) return;
    try {
      await TrackPlayer.setupPlayer({ minBuffer: 15, maxBuffer: 50 });
      await TrackPlayer.updateOptions({
        capabilities: [
          'play' as any, 'pause' as any, 'skipToNext' as any,
          'skipToPrevious' as any, 'seekTo' as any,
        ],
        compactCapabilities: ['play' as any, 'pause' as any, 'skipToNext' as any],
      });
      set({ isInitialized: true });
      console.log('[PlayerStore] ✅ RNTP ready');
    } catch (e) {
      console.warn('[PlayerStore] RNTP init error:', e);
    }
  },

  playTrack: async (track, queue) => {
    const tracks = queue ?? get().queue;
    set({ currentTrack: track, queue: tracks });
    await TrackPlayer.reset();
    await TrackPlayer.add(tracks.map(t => ({
      id: t.id, url: t.uri,
      title: t.title, artist: t.artist,
      duration: t.duration,
    })));
    const idx = tracks.findIndex(t => t.id === track.id);
    if (idx > 0) await TrackPlayer.skip(idx);
    await TrackPlayer.play();
  },

  togglePlayPause: async () => {
    const state = (await TrackPlayer.getPlaybackState()).state;
    if (state === State.Playing) await TrackPlayer.pause();
    else await TrackPlayer.play();
  },

  skipToNext: async () => { await TrackPlayer.skipToNext(); },
  skipToPrevious: async () => { await TrackPlayer.skipToPrevious(); },
  seekTo: async (s) => { await TrackPlayer.seekTo(s); },
  setVolume: (vol) => { TrackPlayer.setVolume(vol); },

  setRepeatMode: (mode) => {
    set({ repeatMode: mode });
    const rm = mode === 'track' ? RepeatMode.Track
             : mode === 'queue' ? RepeatMode.Queue
             : RepeatMode.Off;
    TrackPlayer.setRepeatMode(rm);
  },

  setCurrentTrack: (track) => set({ currentTrack: track }),
  setQueue: (tracks) => set({ queue: tracks }),
}));

// ─── Hooks untuk komponen (harus dipanggil dari dalam React component) ────────
export { usePlaybackState, useProgress, useActiveTrack, rnState };
