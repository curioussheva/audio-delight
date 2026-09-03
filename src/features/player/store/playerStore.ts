// src/features/player/store/playerStore.ts

import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { audioEngine } from "@/features/player/api/engine";
import { Song } from "@/shared/types/audio";
import { LibraryScanner } from "@/features/library/api/scanner";
import { SongQueries } from "@/shared/lib/sqlite";
import { db } from "@/shared/lib/sqlite";
import NativePlaybackService from "@/specs/NativePlaybackService";

export interface LyricLine {
  time: number;
  text: string;
}

export type RepeatMode = "off" | "all" | "track";
export type AudioMode = "bit-perfect" | "dsp";

// AsyncStorage keys
const KEYS = {
  SPEED: "playback_speed",
  EQ: "default_eq",
  MODE: "audio_mode_preference",
  LAST_SONG_ID: "last_song_id",
  LAST_QUEUE_IDS: "last_queue_ids",
  LAST_POSITION: "last_position",
} as const;

let _positionSaveTimer: ReturnType<typeof setTimeout> | null = null;
const savePositionThrottled = (position: number) => {
  if (_positionSaveTimer) return;
  _positionSaveTimer = setTimeout(() => {
    AsyncStorage.setItem(KEYS.LAST_POSITION, position.toString()).catch(
      () => {},
    );
    _positionSaveTimer = null;
  }, 5000);
};

export interface PlayerState {
  currentSong: Song | null;
  queue: Song[];
  isPlaying: boolean;
  position: number;
  duration: number;
  shuffle: boolean;
  repeat: RepeatMode;
  playbackSpeed: number;
  defaultEQ: string;
  audioMode: AudioMode;
  lyrics: LyricLine[];
  sleepTimerEnd: number | null;
  playError: string | null;
  isMainPlayerOpen: boolean;
  isVisualizerOpen: boolean;
  isDrawerOpen: boolean;
  audioSessionId: number | null;

  initStore: () => Promise<void>;
  playSong: (song: Song, newQueue?: Song[]) => Promise<boolean>;
  skipToIndex: (index: number) => Promise<void>;
  playNext: () => Promise<void>;
  playPrevious: () => Promise<void>;
  setIsPlaying: (isPlaying: boolean) => Promise<void>;
  togglePlay: () => Promise<void>;
  seek: (pos: number) => Promise<void>;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  setPlaybackSpeed: (speed: number) => Promise<void>;
  setDefaultEQ: (eq: string) => Promise<void>;
  setAudioMode: (mode: AudioMode) => Promise<void>;
  setSleepTimer: (minutes: number | null) => void;
  setCurrentSong: (song: Song | null) => void;
  setQueue: (songs: Song[]) => void;
  setPosition: (position: number) => void;
  setDuration: (duration: number) => void;
  setLyrics: (lyrics: LyricLine[]) => void;
  clearPlayError: () => void;
  setMainPlayerOpen: (open: boolean) => void;
  setVisualizerOpen: (open: boolean) => void;
  setDrawerOpen: (open: boolean) => void;
  toggleMainPlayer: () => void;
  resetFloatingPlayerVisibility: () => void;
  setAudioSessionId: (id: number | null) => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentSong: null,
  queue: [],
  isPlaying: false,
  position: 0,
  duration: 0,
  shuffle: false,
  repeat: "off",
  playbackSpeed: 1.0,
  defaultEQ: "flat",
  audioMode: "dsp",
  lyrics: [],
  sleepTimerEnd: null,
  playError: null,
  isMainPlayerOpen: false,
  isVisualizerOpen: false,
  isDrawerOpen: false,
  audioSessionId: null,

  // ── Initialization ───────────────────────────────────────────────────────
  initStore: async () => {
    try {
      const [speed, eq, mode, lastSongId, lastQueueIdsRaw, lastPositionRaw] =
        await Promise.all([
          AsyncStorage.getItem(KEYS.SPEED),
          AsyncStorage.getItem(KEYS.EQ),
          AsyncStorage.getItem(KEYS.MODE),
          AsyncStorage.getItem(KEYS.LAST_SONG_ID),
          AsyncStorage.getItem(KEYS.LAST_QUEUE_IDS),
          AsyncStorage.getItem(KEYS.LAST_POSITION),
        ]);

      set({
        ...(speed ? { playbackSpeed: parseFloat(speed) } : {}),
        ...(eq ? { defaultEQ: eq } : {}),
        ...(mode ? { audioMode: mode as AudioMode } : {}),
      });

      const queueIds: string[] = lastQueueIdsRaw
        ? JSON.parse(lastQueueIdsRaw)
        : [];
      const lastPosition = lastPositionRaw ? parseFloat(lastPositionRaw) : 0;

      if (queueIds.length > 0 && lastSongId) {
        const restoredQueue = getSongsByIds(queueIds);
        if (restoredQueue.length > 0) {
          const currentSong =
            restoredQueue.find((s) => s.id === lastSongId) ?? restoredQueue[0];

          set({
            queue: restoredQueue,
            currentSong,
            position: lastPosition,
          });

          try {
            const uris = restoredQueue
              .map((s) => s.uri)
              .filter((uri) => !!uri);
            if (uris.length > 0) {
              NativePlaybackService.setQueue(uris);
              if (lastPosition > 0) {
                NativePlaybackService.seek(lastPosition * 1000);
              }
            }
          } catch (e) {
            console.warn("[Player] Custom playback restore failed:", e);
          }
        }
      }
    } catch (e) {
      console.error("[Player] Failed to init PlayerStore:", e);
    }
  },

  // ── Core Playback ────────────────────────────────────────────────────────
  playSong: async (song: Song, newQueue?: Song[]): Promise<boolean> => {
    if (!song?.id) {
      console.error("[Player] playSong: invalid song");
      set({ playError: "Invalid song" });
      return false;
    }

    const state = get();
    if (state.currentSong?.id === song.id && state.isPlaying) {
      return true;
    }

    let playableSong: Song = song.uri ? { ...song } : await recoverUri(song);

    console.log(`▶️ [Player] playSong: "${playableSong.title}"`);

    const targetQueue = newQueue ?? state.queue;
    if (targetQueue.length === 0) {
      set({ playError: "Queue is empty" });
      return false;
    }

    try {
      const uris = targetQueue.map((s) => s.uri).filter((uri) => !!uri);
      if (uris.length === 0) {
        set({ playError: "No valid URIs" });
        return false;
      }
console.log("🔍 [DEBUG] URIs dikirim ke native:", JSON.stringify(uris.slice(0, 3)));
      NativePlaybackService.setQueue(uris);
      NativePlaybackService.play();

      set({
        currentSong: playableSong,
        queue: targetQueue,
        isPlaying: true,
        position: 0,
        playError: null,
      });

      AsyncStorage.setItem(KEYS.LAST_SONG_ID, playableSong.id).catch(() => {});
      AsyncStorage.setItem(
        KEYS.LAST_QUEUE_IDS,
        JSON.stringify(targetQueue.map((s) => s.id)),
      ).catch(() => {});
      AsyncStorage.setItem(KEYS.LAST_POSITION, "0").catch(() => {});

      SongQueries.incrementPlayCount?.(playableSong.id, 0);

      return true;
    } catch (error: any) {
      console.error("❌ [Player] playSong failed:", error);
      set({ playError: error?.message ?? "Playback failed" });
      return false;
    }
  },

  skipToIndex: async (index: number) => {
    const { queue } = get();
    const song = queue[index];
    if (song) await get().playSong(song);
  },

  playNext: async () => {
    const { queue, currentSong, repeat } = get();
    if (!queue.length || !currentSong) return;

    const idx = queue.findIndex((s) => s.id === currentSong.id);
    let nextIndex = idx + 1;
    if (nextIndex >= queue.length) {
      if (repeat === "all") nextIndex = 0;
      else return;
    }
    await get().skipToIndex(nextIndex);
  },

  playPrevious: async () => {
    const { queue, currentSong, position, repeat } = get();
    if (!queue.length || !currentSong) return;

    if (position > 3) {
      await get().seek(0);
      return;
    }

    const idx = queue.findIndex((s) => s.id === currentSong.id);
    let prevIndex = idx - 1;
    if (prevIndex < 0) {
      if (repeat === "all") prevIndex = queue.length - 1;
      else return;
    }
    await get().skipToIndex(prevIndex);
  },

  setIsPlaying: async (isPlaying: boolean) => {
    try {
      if (isPlaying) NativePlaybackService.play();
      else NativePlaybackService.pause();
      set({ isPlaying });
    } catch (error) {
      console.error("[Player] setIsPlaying failed:", error);
    }
  },

  togglePlay: async () => get().setIsPlaying(!get().isPlaying),

  seek: async (pos: number) => {
    try {
      NativePlaybackService.seek(pos * 1000);
      set({ position: pos });
    } catch (error) {
      console.error("[Player] Seek failed:", error);
    }
  },

  toggleShuffle: () => set((s) => ({ shuffle: !s.shuffle })),

  toggleRepeat: () => {
    const map: Record<RepeatMode, RepeatMode> = {
      off: "all",
      all: "track",
      track: "off",
    };
    set((s) => ({ repeat: map[s.repeat] }));
  },

  setPlaybackSpeed: async (speed: number) => {
    try {
      console.warn("[Player] setPlaybackSpeed belum didukung custom service");
      set({ playbackSpeed: speed });
      await AsyncStorage.setItem(KEYS.SPEED, speed.toString());
    } catch (error) {
      console.error("[Player] setPlaybackSpeed failed:", error);
    }
  },

  setDefaultEQ: async (eq: string) => {
    set({ defaultEQ: eq });
    await AsyncStorage.setItem(KEYS.EQ, eq);
  },

  setAudioMode: async (mode: AudioMode) => {
    set({ audioMode: mode });
    await AsyncStorage.setItem(KEYS.MODE, mode);
    await audioEngine.toggleExclusiveMode(mode === "bit-perfect");
  },

  setSleepTimer: (minutes: number | null) => {
    if (minutes === null) {
      set({ sleepTimerEnd: null });
      return;
    }
    const endTime = Date.now() + minutes * 60_000;
    set({ sleepTimerEnd: endTime });

    setTimeout(() => {
      if (get().sleepTimerEnd === endTime) {
        get().setIsPlaying(false);
        set({ sleepTimerEnd: null });
      }
    }, minutes * 60_000);
  },

  setCurrentSong: (song) => set({ currentSong: song }),
  setQueue: (songs) => set({ queue: songs }),
  setPosition: (position) => {
    set({ position });
    savePositionThrottled(position);
  },
  setDuration: (duration) => set({ duration }),
  setLyrics: (lyrics) => set({ lyrics }),
  clearPlayError: () => set({ playError: null }),
  setMainPlayerOpen: (open) => set({ isMainPlayerOpen: open }),
  setVisualizerOpen: (open) => set({ isVisualizerOpen: open }),
  setDrawerOpen: (open) => set({ isDrawerOpen: open }),
  toggleMainPlayer: () =>
    set((s) => ({ isMainPlayerOpen: !s.isMainPlayerOpen })),
  resetFloatingPlayerVisibility: () =>
    set({
      isMainPlayerOpen: false,
      isVisualizerOpen: false,
      isDrawerOpen: false,
    }),

  setAudioSessionId: (id: number | null) => {
    set({ audioSessionId: id });
    console.log(`[PlayerStore] Audio Session ID updated → ${id}`);
  },
}));

// ─────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────
const getSongsByIds = (ids: string[]): Song[] => {
  if (!ids.length) return [];
  try {
    const placeholders = ids.map(() => "?").join(", ");
    const result = db.execute(
      `SELECT * FROM songs WHERE id IN (${placeholders})`,
      ids,
    );
    const rows = result.rows?._array ?? [];

    return rows.map(
      (row: any) =>
        ({
          id: String(row.id || ""),
          uri: row.uri || "",
          title: row.title || "Unknown Title",
          artist: row.artist || "Unknown Artist",
          album: row.album || "Unknown Album",
          duration: Number(row.duration || 0),
          artwork: row.artwork || undefined,
          genre: row.genre,
          folder: row.folder,
          filename: row.filename,
          sampleRate: Number(row.sampleRate) || undefined,
          bitDepth: Number(row.bitDepth) || undefined,
          bitrate: Number(row.bitrate) || undefined,
          isHiRes: Number(row.sampleRate) > 48000 || Number(row.bitDepth) > 16,
        }) as Song,
    );
  } catch (e) {
    console.warn("[Player] getSongsByIds failed:", e);
    return [];
  }
};

const recoverUri = async (song: Song): Promise<Song> => {
  try {
    const freshSong = await LibraryScanner.getSongById(song.id);
    if (freshSong?.uri) return { ...freshSong };
  } catch (e) {
    console.error("[Player] URI recovery failed:", e);
  }
  return { ...song, uri: `content://media/external/audio/media/${song.id}` };
};

usePlayerStore.getState().initStore(); 