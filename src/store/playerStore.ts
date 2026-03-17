import { create } from 'zustand';
import { Song } from '@/types/audio';
import AsyncStorage from '@react-native-async-storage/async-storage';

// PERBAIKAN 1: Import instance singleton
import { audioEngine } from '@/services/audio/AudioEngine';

interface LirikLine {
  time: number;
  text: string;
}

export interface PlayerState {
  currentSong: Song | null;
  queue: Song[];
  isPlaying: boolean;
  position: number;
  duration: number;
  shuffle: boolean;
  repeat: 'off' | 'all' | 'track';
  playbackSpeed: number;
  defaultEQ: string;
  audioMode: 'bit-perfect' | 'dsp';
  lyrics: LirikLine[];
  sleepTimerEnd: number | null;
  
  initStore: () => Promise<void>;
  setCurrentSong: (song: Song | null) => void;
  setQueue: (songs: Song[]) => void;
  playSong: (song: Song, queue?: Song[]) => Promise<void>;
  setIsPlaying: (isPlaying: boolean) => void;
  togglePlay: () => void;
  setPosition: (position: number) => void;
  setDuration: (duration: number) => void;
  seek: (pos: number) => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  playNext: () => Promise<void>;
  playPrevious: () => Promise<void>;
  setLyrics: (lyrics: LirikLine[]) => void;
  setSleepTimer: (minutes: number | null) => void;
  setPlaybackSpeed: (speed: number) => Promise<void>;
  setDefaultEQ: (eq: string) => Promise<void>;
  setAudioMode: (mode: 'bit-perfect' | 'dsp') => Promise<void>;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentSong: null,
  queue: [],
  isPlaying: false,
  position: 0,
  duration: 0,
  shuffle: false,
  repeat: 'off',
  playbackSpeed: 1.0,
  defaultEQ: 'Flat',
  audioMode: 'dsp',
  lyrics: [],
  sleepTimerEnd: null,

  seek: (pos: number) => {
    // PERBAIKAN 2: Gunakan audioEngine
    audioEngine.seekTo(pos); 
    set({ position: pos });
  },

  initStore: async () => {
    try {
      const [speed, eq, mode] = await Promise.all([
        AsyncStorage.getItem('playback_speed'),
        AsyncStorage.getItem('default_eq'),
        AsyncStorage.getItem('audio_mode_preference'),
      ]);
      
      if (speed) set({ playbackSpeed: parseFloat(speed) });
      if (eq) set({ defaultEQ: eq });
      if (mode) set({ audioMode: mode as 'bit-perfect' | 'dsp' });
    } catch (e) {
      console.error("Failed to init store", e);
    }
  },

  setLyrics: (lyrics) => set({ lyrics }),

  setSleepTimer: (minutes) => {
    if (minutes === null) {
      set({ sleepTimerEnd: null });
      return;
    }
    const endTime = Date.now() + minutes * 60000;
    set({ sleepTimerEnd: endTime });

    const checkTimer = setInterval(() => {
      const state = get();
      if (!state.sleepTimerEnd) {
        clearInterval(checkTimer);
        return;
      }
      if (Date.now() >= state.sleepTimerEnd) {
        get().setIsPlaying(false); // Gunakan setIsPlaying agar engine juga pause
        set({ sleepTimerEnd: null });
        clearInterval(checkTimer);
      }
    }, 1000);
  },

  playSong: async (song, newQueue) => {
    const targetQueue = newQueue || get().queue;
    const index = targetQueue.findIndex(s => s.id === song.id);

    set({ currentSong: song, queue: targetQueue, isPlaying: true, position: 0 });
    
    await audioEngine.setQueue(targetQueue, index >= 0 ? index : 0);
    await audioEngine.play();
  },

  togglePlay: () => {
    const { isPlaying } = get();
    // Panggil setter agar logic engine terpicu
    get().setIsPlaying(!isPlaying);
  },

  setIsPlaying: (isPlaying) => {
    // PERBAIKAN 3: Trigger engine sesuai state
    isPlaying ? audioEngine.play() : audioEngine.pause();
    set({ isPlaying });
  },

  playNext: async () => {
    if (!get().queue.length) return;
    await audioEngine.skipToNext(); 
  },

  playPrevious: async () => {
    if (!get().queue.length) return;
    await audioEngine.skipToPrevious();
  },

  setAudioMode: async (mode) => {
    await AsyncStorage.setItem('audio_mode_preference', mode);
    // PERBAIKAN 4: Nama method sesuai AudioEngine.ts
    await audioEngine.toggleExclusiveMode(mode === 'bit-perfect');
    set({ audioMode: mode });
  },

  setCurrentSong: (song) => set({ currentSong: song }),
  setQueue: (songs) => set({ queue: songs }),
  setPosition: (position) => set({ position }),
  setDuration: (duration) => set({ duration }),
  
  setPlaybackSpeed: async (speed) => {
    set({ playbackSpeed: speed });
    await audioEngine.setPlaybackRate(speed);
    await AsyncStorage.setItem('playback_speed', speed.toString());
  },
  
  toggleShuffle: () => set((state) => ({ shuffle: !state.shuffle })),
  
  toggleRepeat: () => {
    const current = get().repeat;
    const nextRepeat = current === 'off' ? 'all' : 
                       current === 'all' ? 'track' : 'off';
    
    audioEngine.setRepeatMode(nextRepeat);
    set({ repeat: nextRepeat });
  },

  setDefaultEQ: async (eq) => {
    set({ defaultEQ: eq });
    await AsyncStorage.setItem('default_eq', eq);
  },
}));
