import { create } from 'zustand';
import { Song } from '@/shared/types/audio';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from "expo-file-system";
import { audioEngine } from '@/features/player/api/engine';

interface LirikLine {
  time: number;
  text: string;
}

// ─── Resolve SATU URI content:// ke file:// cache ─────────────────────────
const resolvePlayableUri = async (uri: string): Promise<string> => {
  if (!uri.startsWith("content://")) return uri;

  try {
    const filename = decodeURIComponent(
      uri.split("%2F").pop() ?? uri.split("/").pop() ?? "audio"
    );
    const cacheDir = `${FileSystem.cacheDirectory}audio/`;
    const dest = `${cacheDir}${filename}`;

    await FileSystem.makeDirectoryAsync(cacheDir, { intermediates: true });

    const info = await FileSystem.getInfoAsync(dest);
    if (!info.exists) {
      await FileSystem.copyAsync({ from: uri, to: dest });
    }
    return dest;
  } catch (e) {
    console.warn("[resolvePlayableUri] Gagal copy ke cache:", e);
    return uri;
  }
};

// ─── Resolve sebagian queue di sekitar lagu aktif (max 20 lagu) ───────────
const resolveQueuePartial = async (
  songs: Song[],
  centerIndex: number
): Promise<Song[]> => {
  const start = Math.max(0, centerIndex - 5);
  const end   = Math.min(songs.length, centerIndex + 15);
  const slice = songs.slice(start, end);

  const resolved = await Promise.all(
    slice.map(async (s) => ({
      ...s,
      uri: await resolvePlayableUri(s.uri),
    }))
  );

  return [
    ...songs.slice(0, start),
    ...resolved,
    ...songs.slice(end),
  ];
};

// ─────────────────────────────────────────────────────────────────────────
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
  currentSong:   null,
  queue:         [],
  isPlaying:     false,
  position:      0,
  duration:      0,
  shuffle:       false,
  repeat:        'off',
  playbackSpeed: 1.0,
  defaultEQ:     'Flat',
  audioMode:     'dsp',
  lyrics:        [],
  sleepTimerEnd: null,

  // ── Seek ──────────────────────────────────────────────────────
  seek: (pos) => {
    audioEngine.seekTo(pos);
    set({ position: pos });
  },

  // ── Init ──────────────────────────────────────────────────────
  initStore: async () => {
    try {
      const [speed, eq, mode] = await Promise.all([
        AsyncStorage.getItem('playback_speed'),
        AsyncStorage.getItem('default_eq'),
        AsyncStorage.getItem('audio_mode_preference'),
      ]);
      if (speed) set({ playbackSpeed: parseFloat(speed) });
      if (eq)    set({ defaultEQ: eq });
      if (mode)  set({ audioMode: mode as 'bit-perfect' | 'dsp' });
    } catch (e) {
      console.error("Failed to init store", e);
    }
  },

  // ── Play Song ─────────────────────────────────────────────────
  playSong: async (song, newQueue) => {
    try {
      console.log('▶️ [Player] playSong:', song.title);

      const targetQueue  = newQueue ?? get().queue;
      const centerIndex  = targetQueue.findIndex(s => s.id === song.id);
      const sessionSongId = song.id;

      // 1. Resolve URI lagu aktif saja — ini yang paling penting
      const playableUri  = await resolvePlayableUri(song.uri);
      const playableSong = { ...song, uri: playableUri };

      // 2. Update UI segera
      set({ currentSong: playableSong, queue: targetQueue, isPlaying: true, position: 0 });

      // 3. Play lagu aktif dulu tanpa tunggu queue penuh
      await audioEngine.setQueue([playableSong], 0);
      await audioEngine.play();
      console.log('✅ [Player] Playing:', song.title);

      // 4. Resolve 20 lagu di sekitar lagu aktif di background
      //    Hanya update queue jika user belum pindah lagu
      resolveQueuePartial(targetQueue, centerIndex >= 0 ? centerIndex : 0)
        .then(async (resolvedQueue) => {
          if (get().currentSong?.id !== sessionSongId) return;
          const idx = resolvedQueue.findIndex(s => s.id === song.id);
          await audioEngine.setQueue(resolvedQueue, idx >= 0 ? idx : 0);
          console.log('📋 [Player] Queue loaded:', resolvedQueue.length, 'tracks');
        })
        .catch(e => {
          console.warn('[Player] Background queue resolve failed:', e);
        });

    } catch (e) {
      console.error('❌ [Player] playSong error:', e);
      set({ isPlaying: false });
    }
  },

  // ── Playback Controls ─────────────────────────────────────────
  togglePlay: () => {
    get().setIsPlaying(!get().isPlaying);
  },

  setIsPlaying: (isPlaying) => {
    if (isPlaying) audioEngine.play();
    else           audioEngine.pause();
    set({ isPlaying });
  },

  playNext: async () => {
  const { queue, currentSong } = get();
  if (!queue.length) return;

  const currentIndex = queue.findIndex(s => s.id === currentSong?.id);
  const nextIndex = currentIndex < queue.length - 1 ? currentIndex + 1 : 0;
  const nextSong = queue[nextIndex];

  if (nextSong) {
    await get().playSong(nextSong, queue);
  }
},

  playPrevious: async () => {
  const { queue, currentSong, position } = get();
  if (!queue.length) return;

  // Jika sudah lebih dari 3 detik, restart lagu saat ini
  if (position > 3) {
    await audioEngine.seekTo(0);
    usePlayerStore.setState({ position: 0 });
    return;
  }

  const currentIndex = queue.findIndex(s => s.id === currentSong?.id);
  const prevIndex = currentIndex > 0 ? currentIndex - 1 : queue.length - 1;
  const prevSong = queue[prevIndex];

  if (prevSong) {
    await get().playSong(prevSong, queue);
  }
},

  seek: (pos) => {
    audioEngine.seekTo(pos);
    set({ position: pos });
  },
  
  

  // ── Audio Mode ────────────────────────────────────────────────
  setAudioMode: async (mode) => {
    await AsyncStorage.setItem('audio_mode_preference', mode);
    await audioEngine.toggleExclusiveMode(mode === 'bit-perfect');
    set({ audioMode: mode });
  },

  // ── Sleep Timer ───────────────────────────────────────────────
  setSleepTimer: (minutes) => {
    if (minutes === null) {
      set({ sleepTimerEnd: null });
      return;
    }
    const endTime = Date.now() + minutes * 60000;
    set({ sleepTimerEnd: endTime });

    const checkTimer = setInterval(() => {
      const state = get();
      if (!state.sleepTimerEnd) { clearInterval(checkTimer); return; }
      if (Date.now() >= state.sleepTimerEnd) {
        get().setIsPlaying(false);
        set({ sleepTimerEnd: null });
        clearInterval(checkTimer);
      }
    }, 1000);
  },

  // ── Shuffle & Repeat ──────────────────────────────────────────
  toggleShuffle: () => set((state) => ({ shuffle: !state.shuffle })),

  toggleRepeat: () => {
    const current = get().repeat;
    const next = current === 'off' ? 'all' : current === 'all' ? 'track' : 'off';
    audioEngine.setRepeatMode(next);
    set({ repeat: next });
  },

  // ── Setters ───────────────────────────────────────────────────
  setCurrentSong:  (song)     => set({ currentSong: song }),
  setQueue:        (songs)    => set({ queue: songs }),
  setPosition:     (position) => set({ position }),
  setDuration:     (duration) => set({ duration }),
  setLyrics:       (lyrics)   => set({ lyrics }),

  setPlaybackSpeed: async (speed) => {
    set({ playbackSpeed: speed });
    await audioEngine.setPlaybackRate(speed);
    await AsyncStorage.setItem('playback_speed', speed.toString());
  },

  setDefaultEQ: async (eq) => {
    set({ defaultEQ: eq });
    await AsyncStorage.setItem('default_eq', eq);
  },
}));  