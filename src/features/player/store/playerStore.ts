import { create } from 'zustand';
import { Song } from '@/shared/types/audio';
import AsyncStorage from '@react-native-async-storage/async-storage';
import TrackPlayer from 'react-native-track-player';
import { audioEngine } from '@/features/player/api/engine';

interface LirikLine { time: number; text: string; }

// Song → RNTP Track mapping
const songToTrack = (s: Song) => ({
  id:       s.id,
  url:      s.uri,
  title:    s.title,
  artist:   s.artist,
  album:    s.album || '',
  duration: s.duration,
  artwork:  s.artwork,
});

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

      const targetQueue   = newQueue ?? get().queue;
      const sessionSongId = song.id;
      const songIndex     = targetQueue.findIndex(s => s.id === song.id);

      // 1. Update UI segera
      set({ currentSong: song, queue: targetQueue, isPlaying: true, position: 0 });

      // 2. Reset RNTP dan load lagu aktif + seluruh queue sekaligus
      //    Content URI sudah bisa dibaca ExoPlayer langsung — tidak perlu copy
      await TrackPlayer.reset();
      await TrackPlayer.add(targetQueue.map(songToTrack));

      // 3. Skip ke lagu yang dipilih
      if (songIndex > 0) {
        await TrackPlayer.skip(songIndex);
      }

      // 4. Play
      await TrackPlayer.play();
      console.log('✅ [Player] Playing:', song.title, `| Queue: ${targetQueue.length} tracks`);

    } catch (e) {
      console.error('❌ [Player] playSong error:', e);
      set({ isPlaying: false });
    }
  },

  // ── Playback Controls ─────────────────────────────────────────
  togglePlay: () => get().setIsPlaying(!get().isPlaying),

  setIsPlaying: (isPlaying) => {
    if (isPlaying) audioEngine.play();
    else           audioEngine.pause();
    set({ isPlaying });
  },

  playNext: async () => {
    const { queue, currentSong } = get();
    if (!queue.length) return;
    const idx  = queue.findIndex(s => s.id === currentSong?.id);
    const next = queue[(idx + 1) % queue.length];
    if (next) await get().playSong(next, queue);
  },

  playPrevious: async () => {
    const { queue, currentSong, position } = get();
    if (!queue.length) return;
    // Restart lagu jika sudah > 3 detik
    if (position > 3) {
      await audioEngine.seekTo(0);
      set({ position: 0 });
      return;
    }
    const idx  = queue.findIndex(s => s.id === currentSong?.id);
    const prev = queue[idx > 0 ? idx - 1 : queue.length - 1];
    if (prev) await get().playSong(prev, queue);
  },

  // ── Audio Mode ────────────────────────────────────────────────
  setAudioMode: async (mode) => {
    await AsyncStorage.setItem('audio_mode_preference', mode);
    await audioEngine.toggleExclusiveMode(mode === 'bit-perfect');
    set({ audioMode: mode });
  },

  // ── Sleep Timer ───────────────────────────────────────────────
  setSleepTimer: (minutes) => {
    if (minutes === null) { set({ sleepTimerEnd: null }); return; }
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