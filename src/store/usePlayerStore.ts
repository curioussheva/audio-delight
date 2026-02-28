import { create } from 'zustand';
import TrackPlayer, {
  State, RepeatMode, Capability,
  usePlaybackState, useProgress, useActiveTrack,
} from 'react-native-track-player';
import { Track, PlaybackState } from '../types/audio.types';

export function rnState(s: State | undefined): PlaybackState {
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
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentTrack: null,
  queue: [],
  repeatMode: 'off',
  isInitialized: false,

  init: async () => {
    if (get().isInitialized) return;
    try {
      await TrackPlayer.getPlaybackState();
      set({ isInitialized: true }); return;
    } catch (_) {}
    try {
      await TrackPlayer.setupPlayer({ minBuffer: 15, maxBuffer: 50 });
      await TrackPlayer.updateOptions({
        capabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext, Capability.SkipToPrevious, Capability.SeekTo],
        compactCapabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext],
      });
      set({ isInitialized: true });
    } catch (e: any) {
      if (e?.message?.includes('already been initialized')) set({ isInitialized: true });
      else console.error('[PlayerStore] init error:', e);
    }
  },

  playTrack: async (track, queue) => {
    const tracks = queue ?? get().queue;
    set({ currentTrack: track, queue: tracks });
    await TrackPlayer.reset();
    await TrackPlayer.add(tracks.map(t => ({ id: t.id, url: t.uri, title: t.title, artist: t.artist, duration: t.duration })));
    const idx = tracks.findIndex(t => t.id === track.id);
    if (idx > 0) await TrackPlayer.skip(idx);
    await TrackPlayer.play();
  },

  togglePlayPause: async () => {
    const { state } = await TrackPlayer.getPlaybackState();
    if (state === State.Playing) await TrackPlayer.pause();
    else await TrackPlayer.play();
  },

  skipToNext: async () => { await TrackPlayer.skipToNext(); },
  skipToPrevious: async () => { await TrackPlayer.skipToPrevious(); },
  seekTo: async (s: number) => { await TrackPlayer.seekTo(s); },
  setVolume: (vol: number) => { TrackPlayer.setVolume(vol); },
  setRepeatMode: (mode: 'off' | 'track' | 'queue') => {
    set({ repeatMode: mode });
    TrackPlayer.setRepeatMode(mode === 'track' ? RepeatMode.Track : mode === 'queue' ? RepeatMode.Queue : RepeatMode.Off);
  },
  setCurrentTrack: (track) => set({ currentTrack: track }),
}));

export { usePlaybackState, useProgress, useActiveTrack };
