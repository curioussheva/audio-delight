import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { Song, Playlist, PlaybackState, Queue } from '@/types/audio';

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
  
  setPlayback: (state: Partial<PlaybackState>) => void;
  setQueue: (queue: Partial<Queue>) => void;
  setCurrentSong: (song: Song | null) => void;
  
  // Actions
  play: () => void;
  pause: () => void;
  next: () => void;
  previous: () => void;
  seek: (position: number) => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
}

export const useAudioStore = create<AudioStore>()(
  immer((set, get) => ({
    // Initial State
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

    // Library Actions
    addSongs: (newSongs) => {
      set((state) => {
        const existingIds = new Set(state.songs.map(s => s.id));
        const uniqueSongs = newSongs.filter(s => !existingIds.has(s.id));
        state.songs.push(...uniqueSongs);
      });
    },

    createPlaylist: (name) => {
      set((state) => {
        state.playlists.push({
          id: Date.now().toString(),
          name,
          songs: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      });
    },

    addToPlaylist: (playlistId, songId) => {
      set((state) => {
        const playlist = state.playlists.find(p => p.id === playlistId);
        if (playlist && !playlist.songs.includes(songId)) {
          playlist.songs.push(songId);
          playlist.updatedAt = Date.now();
        }
      });
    },

    // Playback Actions
    setPlayback: (newState) => {
      set((state) => {
        Object.assign(state.playback, newState);
      });
    },

    setQueue: (newQueue) => {
      set((state) => {
        Object.assign(state.queue, newQueue);
      });
    },

    setCurrentSong: (song) => {
      set((state) => {
        state.currentSong = song;
      });
    },

    play: () => {
      set((state) => {
        state.playback.isPlaying = true;
      });
    },

    pause: () => {
      set((state) => {
        state.playback.isPlaying = false;
      });
    },

    next: () => {
      const { queue, songs } = get();
      if (queue.songs.length === 0) return;
      
      let nextIndex = queue.currentIndex + 1;
      
      if (nextIndex >= queue.songs.length) {
        if (queue.repeat === 'queue') {
          nextIndex = 0;
        } else {
          return; // End of queue
        }
      }
      
      set((state) => {
        state.queue.currentIndex = nextIndex;
        state.currentSong = queue.songs[nextIndex];
        state.playback.position = 0;
      });
    },

    previous: () => {
      const { queue } = get();
      if (queue.currentIndex > 0) {
        set((state) => {
          state.queue.currentIndex -= 1;
          state.currentSong = queue.songs[state.queue.currentIndex];
          state.playback.position = 0;
        });
      }
    },

    seek: (position) => {
      set((state) => {
        state.playback.position = position;
      });
    },

    toggleShuffle: () => {
      set((state) => {
        state.queue.shuffle = !state.queue.shuffle;
        // TODO: Implement shuffle logic
      });
    },

    toggleRepeat: () => {
      set((state) => {
        const modes: ('off' | 'track' | 'queue')[] = ['off', 'track', 'queue'];
        const currentIndex = modes.indexOf(state.queue.repeat);
        state.queue.repeat = modes[(currentIndex + 1) % modes.length];
      });
    },
  }))
);
