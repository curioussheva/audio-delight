import { create } from 'zustand';
import { Song } from '@/types/audio';

interface PlayerState {
  currentSong: Song | null;
  queue: Song[];
  isPlaying: boolean;
  position: number;
  duration: number;
  shuffle: boolean;
  repeat: 'off' | 'all' | 'track';
  setCurrentSong: (song: Song | null) => void;
  setQueue: (songs: Song[]) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setPosition: (position: number) => void;
  setDuration: (duration: number) => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  playNext: () => void;
  playPrevious: () => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentSong: null,
  queue: [],
  isPlaying: false,
  position: 0,
  duration: 0,
  shuffle: false,
  repeat: 'off',

  setCurrentSong: (song) => set({ currentSong: song }),
  setQueue: (songs) => set({ queue: songs }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setPosition: (position) => set({ position }),
  setDuration: (duration) => set({ duration }),

  toggleShuffle: () => set((state) => ({ shuffle: !state.shuffle })),
  
  toggleRepeat: () => set((state) => {
    const nextRepeat = state.repeat === 'off' ? 'all' : 
                       state.repeat === 'all' ? 'track' : 'off';
    return { repeat: nextRepeat };
  }),

  playNext: () => {
    const { queue, currentSong, repeat, shuffle } = get();
    if (!queue.length || !currentSong) return;
    
    let nextIndex;
    if (shuffle) {
      // Random, tapi hindari lagu yang sama
      do {
        nextIndex = Math.floor(Math.random() * queue.length);
      } while (queue.length > 1 && queue[nextIndex].id === currentSong.id);
    } else {
      const currentIndex = queue.findIndex((s) => s.id === currentSong.id);
      nextIndex = (currentIndex + 1) % queue.length;
      
      // Jika repeat off dan di akhir queue, stop
      if (repeat === 'off' && nextIndex === 0) {
        set({ isPlaying: false });
        return;
      }
    }
    
    set({ currentSong: queue[nextIndex] });
  },

  playPrevious: () => {
    const { queue, currentSong, shuffle } = get();
    if (!queue.length || !currentSong) return;
    
    let prevIndex;
    if (shuffle) {
      // Random
      prevIndex = Math.floor(Math.random() * queue.length);
    } else {
      const currentIndex = queue.findIndex((s) => s.id === currentSong.id);
      prevIndex = (currentIndex - 1 + queue.length) % queue.length;
    }
    
    set({ currentSong: queue[prevIndex] });
  },
}));