import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import TrackPlayer from 'react-native-track-player';

import { Song, Playlist, PlaybackState, Queue } from '@/types/audio';

// ────────────────────────────────────────────────
// Interface AudioStore
// ────────────────────────────────────────────────
interface AudioStore {
  // Library
  songs: Song[];
  playlists: Playlist[];
  addSongs: (songs: Song[]) => void;
  createPlaylist: (name: string) => void;
  addToPlaylist: (playlistId: string, songId: string) => void;

  // Playback
  playback: PlaybackState;
  queue: Queue;
  currentSong: Song | null;

  // Setters
  setPlayback: (updates: Partial<PlaybackState>) => void;
  setQueue: (updates: Partial<Queue>) => void;
  setCurrentSong: (song: Song | null) => void;

  // Controls (sync dengan TrackPlayer)
  play: () => Promise<void>;
  pause: () => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  seek: (position: number) => Promise<void>;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
}

// ────────────────────────────────────────────────
// Zustand Store
// ────────────────────────────────────────────────
export const useAudioStore = create<AudioStore>()(
  persist(
    immer((set, get) => ({
      // ─── Initial State ────────────────────────────────────────
      songs: [],
      playlists: [],
      playback: {
        isPlaying: false,
        isLoading: false,
        position: 0,
        duration: 0,
        buffered: 0,
        volume: 1.0,
        rate: 1.0,
      },
      queue: {
        songs: [],
        currentIndex: -1,
        shuffle: false,
        repeat: 'off',
      },
      currentSong: null,

      // ─── Library Actions ──────────────────────────────────────
      addSongs: (newSongs) => {
        set((state) => {
          const existingIds = new Set(state.songs.map((s: Song) => s.id));
          const uniqueNew = newSongs.filter((s: Song) => !existingIds.has(s.id));
          state.songs.push(...uniqueNew);
        });
      },

      createPlaylist: (name) => {
        set((state) => {
          const id = `playlist-${Date.now()}`;
          state.playlists.push({ id, name, songs: [] });
        });
      },

      addToPlaylist: (playlistId, songId) => {
        set((state) => {
          const playlist = state.playlists.find((p: Playlist) => p.id === playlistId);
          if (playlist) {
            const song = state.songs.find((s: Song) => s.id === songId);
            if (song && !playlist.songs.some((s: Song) => s.id === songId)) {
              playlist.songs.push(song);
            }
          }
        });
      },

      // ─── Playback Setters ─────────────────────────────────────
      setPlayback: (updates) => set((state) => Object.assign(state.playback, updates)),
      setQueue: (updates) => set((state) => Object.assign(state.queue, updates)),
      setCurrentSong: (song) => set({ currentSong: song }),

      // ─── Player Controls (sync dengan RNTP) ───────────────────
      play: async () => {
        const { queue, currentSong } = get();
        if (!currentSong) return;

        await TrackPlayer.reset();
        await TrackPlayer.add(queue.songs.map((s) => ({
          id: s.id,
          url: s.uri,
          title: s.title,
          artist: s.artist,
          artwork: s.artwork,
          duration: s.duration,
        })));
        await TrackPlayer.skip(queue.currentIndex);
        await TrackPlayer.play();

        set((state) => { state.playback.isPlaying = true; });
      },

      pause: async () => {
        await TrackPlayer.pause();
        set((state) => { state.playback.isPlaying = false; });
      },

      next: async () => {
        const { queue } = get();
        let nextIndex = queue.currentIndex + 1;

        if (nextIndex >= queue.songs.length) {
          if (queue.repeat === 'queue') nextIndex = 0;
          else return;
        }

        await TrackPlayer.skip(nextIndex);
        await TrackPlayer.play();

        set((state) => {
          state.queue.currentIndex = nextIndex;
          state.currentSong = queue.songs[nextIndex];
          state.playback.position = 0;
          state.playback.isPlaying = true;
        });
      },

      previous: async () => {
        const { queue } = get();
        if (queue.currentIndex <= 0) return;

        const prevIndex = queue.currentIndex - 1;
        await TrackPlayer.skip(prevIndex);
        await TrackPlayer.play();

        set((state) => {
          state.queue.currentIndex = prevIndex;
          state.currentSong = queue.songs[prevIndex];
          state.playback.position = 0;
          state.playback.isPlaying = true;
        });
      },

      seek: async (position) => {
        await TrackPlayer.seekTo(position);
        set((state) => { state.playback.position = position; });
      },

      toggleShuffle: () => {
        set((state) => {
          state.queue.shuffle = !state.queue.shuffle;
          // TODO: Implement real shuffle (misal shuffle array queue.songs)
          // Jika shuffle on: shuffle array, simpan original order jika perlu
        });
      },

      toggleRepeat: () => {
        set((state) => {
          const modes: Queue['repeat'][] = ['off', 'track', 'queue'];
          const currentIndex = modes.indexOf(state.queue.repeat);
          state.queue.repeat = modes[(currentIndex + 1) % modes.length];
        });
      },
    })),
    {
      name: 'audio-store',
      partialize: (state) => ({ playlists: state.playlists }),
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
