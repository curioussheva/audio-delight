import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import TrackPlayer from "react-native-track-player";
import { audioEngine } from "@/features/player/api/engine";
import { Song } from "@/shared/types/audio";
import { LibraryScanner } from "@/features/library/api/scanner";
import { SongQueries } from "@/shared/lib/sqlite"; // ✅ untuk incrementPlayCount

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface LyricLine {
  time: number;
  text: string;
}

export type RepeatMode = "off" | "all" | "track";
export type AudioMode = "bit-perfect" | "dsp";

// ─────────────────────────────────────────────
// AsyncStorage keys
// ─────────────────────────────────────────────

const KEYS = {
  SPEED:        "playback_speed",
  EQ:           "default_eq",
  MODE:         "audio_mode_preference",
  LAST_SONG_ID: "last_song_id",       // ✅ hanya ID, bukan full object
  LAST_QUEUE_IDS: "last_queue_ids",   // ✅ JSON array of IDs
  LAST_POSITION: "last_position",     // ✅ posisi dalam detik
} as const;

// Throttle position save — jangan write AsyncStorage tiap detik
let _positionSaveTimer: ReturnType<typeof setTimeout> | null = null;
const savePositionThrottled = (position: number) => {
  if (_positionSaveTimer) return;
  _positionSaveTimer = setTimeout(() => {
    AsyncStorage.setItem(KEYS.LAST_POSITION, position.toString()).catch(() => {});
    _positionSaveTimer = null;
  }, 5_000); // simpan setiap 5 detik maksimal
};

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const normalizeUri = (uri: string): string => {
  if (!uri) return "";
  if (
    uri.startsWith("http://") ||
    uri.startsWith("https://") ||
    uri.startsWith("content://") ||
    uri.startsWith("file://")
  ) {
    return uri;
  }
  return `file://${uri}`;
};

const songToTrack = (s: Song) => ({
  id: s.id,
  url: normalizeUri(s.uri),
  title: s.title || "Unknown Title",
  artist: s.artist || "Unknown Artist",
  album: s.album || "",
  duration: s.duration || 0,
  artwork: s.artwork,
});

const recoverUri = async (song: Song): Promise<Song> => {
  console.log(`[Player] Missing URI for "${song.title}", trying to recover from DB...`);
  try {
    const freshSong = await LibraryScanner.getSongById(song.id);
    if (freshSong?.uri) {
      console.log(`[Player] URI recovered for "${song.title}"`);
      return { ...freshSong };
    }
  } catch (e) {
    console.error(`[Player] URI recovery failed:`, e);
  }
  const fallbackUri = `content://media/external/audio/media/${song.id}`;
  console.log(`[Player] Using fallback URI for "${song.title}"`);
  return { ...song, uri: fallbackUri };
};

const getTrackPlayerQueueSize = async (): Promise<number> => {
  try {
    const queue = await TrackPlayer.getQueue();
    return queue.length;
  } catch {
    return 0;
  }
};

/**
 * Query DB untuk ambil Song objects berdasarkan array of IDs.
 * Hasilnya di-sort sesuai urutan IDs (preserve queue order).
 */
const getSongsByIds = (ids: string[]): Song[] => {
  if (!ids.length) return [];
  try {
    const placeholders = ids.map(() => "?").join(", ");
    const result = LibraryScanner.db?.execute(
      `SELECT * FROM songs WHERE id IN (${placeholders}) AND uri IS NOT NULL`,
      ids,
    );
    const rows: Song[] = result?.rows?._array ?? [];

    // Preserve original queue order
    const map = new Map(rows.map((s) => [s.id, s]));
    return ids.map((id) => map.get(id)).filter(Boolean) as Song[];
  } catch (e) {
    console.warn("[Player] getSongsByIds failed:", e);
    return [];
  }
};

// ─────────────────────────────────────────────
// State interface
// ─────────────────────────────────────────────

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
}

// ─────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────

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

  // ── initStore ──────────────────────────────────────────────────────────────
  initStore: async () => {
    try {
      const [speed, eq, mode, lastSongId, lastQueueIdsRaw, lastPositionRaw] =
        await Promise.all([
          AsyncStorage.getItem(KEYS.SPEED),
          AsyncStorage.getItem(KEYS.EQ),
          AsyncStorage.getItem(KEYS.MODE),
          AsyncStorage.getItem(KEYS.LAST_SONG_ID),   // ✅ hanya ID
          AsyncStorage.getItem(KEYS.LAST_QUEUE_IDS), // ✅ JSON array of IDs
          AsyncStorage.getItem(KEYS.LAST_POSITION),
        ]);

      // Restore settings ke store dulu
      set({
        ...(speed ? { playbackSpeed: parseFloat(speed) } : {}),
        ...(eq    ? { defaultEQ: eq } : {}),
        ...(mode  ? { audioMode: mode as AudioMode } : {}),
      });

      // ── Restore queue dari DB (URI selalu fresh) ──────────────────────────
      const queueIds: string[] = safeJsonParse<string[]>(lastQueueIdsRaw ?? "", []);
      const lastPosition = lastPositionRaw ? parseFloat(lastPositionRaw) : 0;

      if (queueIds.length > 0 && lastSongId) {
        // Query DB — bukan dari AsyncStorage yang bisa stale
        const restoredQueue = getSongsByIds(queueIds);

        if (restoredQueue.length > 0) {
          const currentSong =
            restoredQueue.find((s) => s.id === lastSongId) ?? restoredQueue[0];

          set({ queue: restoredQueue, currentSong, position: lastPosition });

          // ── Restore ke TrackPlayer (silent, tanpa autoplay) ──────────────
          try {
            const tracks = restoredQueue.map(songToTrack).filter((t) => !!t.url);
            if (tracks.length > 0) {
              await TrackPlayer.reset();
              await TrackPlayer.add(tracks);

              const songIndex = restoredQueue.findIndex((s) => s.id === currentSong.id);
              if (songIndex >= 0) {
                await TrackPlayer.skip(songIndex);
              }

              // Restore posisi — user harus tap play sendiri
              if (lastPosition > 0) {
                await TrackPlayer.seekTo(lastPosition);
              }

              console.log(
                `[Player] Restored ${tracks.length} tracks to queue | Last: "${currentSong.title}" @ ${lastPosition.toFixed(0)}s`,
              );
            }
          } catch (e) {
            console.warn("[Player] TrackPlayer queue restore failed:", e);
            // Non-fatal — playSong akan handle reload saat user tap play
          }
        }
      }
    } catch (e) {
      console.error("[Player] Failed to init PlayerStore:", e);
    }
  },

  // ── playSong ───────────────────────────────────────────────────────────────
  playSong: async (song: Song, newQueue?: Song[]): Promise<boolean> => {
    if (!song?.id) {
      console.error("[Player] playSong: invalid song object");
      set({ playError: "Invalid song" });
      return false;
    }

    const state = get();
    if (state.currentSong?.id === song.id && state.isPlaying) {
      console.log(`[Player] Already playing "${song.title}", skipping`);
      return true;
    }

    let playableSong: Song = song.uri ? { ...song } : await recoverUri(song);

    console.log(
      `▶️ [Player] playSong: "${playableSong.title}" | URI: ${
        playableSong.uri ? playableSong.uri.substring(0, 60) + "..." : "NO URI"
      }`,
    );

    const targetQueue = newQueue ?? state.queue;
    if (targetQueue.length === 0) {
      console.error("[Player] playSong: queue is empty");
      set({ playError: "Queue is empty" });
      return false;
    }

    const songIndex = targetQueue.findIndex((s) => s.id === playableSong.id);
    const skipIndex = songIndex !== -1 ? songIndex : 0;

    const tpQueueSize = await getTrackPlayerQueueSize();
    const needsReload = !!newQueue || tpQueueSize !== targetQueue.length;

    if (needsReload && !newQueue) {
      console.log(
        `[Player] TP queue stale (${tpQueueSize} vs ${targetQueue.length}), reloading...`,
      );
    }

    try {
      if (needsReload) {
        await TrackPlayer.reset();
        const tracks = targetQueue.map(songToTrack).filter((t) => !!t.url);
        if (tracks.length === 0) throw new Error("No valid tracks with URL");
        await TrackPlayer.add(tracks);
        console.log(`[Player] Added ${tracks.length} tracks to queue`);

        if (newQueue) {
          // ✅ Simpan IDs saja, bukan full Song objects
          const queueIds = targetQueue.map((s) => s.id);
          AsyncStorage.setItem(KEYS.LAST_QUEUE_IDS, JSON.stringify(queueIds)).catch(() => {});
        }
      }

      await TrackPlayer.skip(skipIndex);
      await TrackPlayer.play();

      set({
        currentSong: playableSong,
        queue: targetQueue,
        isPlaying: true,
        position: 0,
        playError: null,
      });

      console.log(
        `✅ [Player] Playing: "${playableSong.title}" | Queue: ${targetQueue.length} tracks`,
      );

      // ✅ Simpan last_song_id (bukan full object)
      AsyncStorage.setItem(KEYS.LAST_SONG_ID, playableSong.id).catch(() => {});
      // Reset posisi saat lagu baru
      AsyncStorage.setItem(KEYS.LAST_POSITION, "0").catch(() => {});

      // ✅ Catat ke recent_plays DB
      try {
        SongQueries.incrementPlayCount(playableSong.id, 0);
      } catch {
        // Non-fatal
      }

      return true;
    } catch (error: any) {
      console.error("❌ [Player] playSong failed:", error);
      set({ isPlaying: false, playError: error?.message ?? "Playback failed" });
      return false;
    }
  },

  // ── skipToIndex ────────────────────────────────────────────────────────────
  skipToIndex: async (index: number) => {
    const { queue } = get();
    const song = queue[index];
    if (!song) {
      console.warn(`[Player] skipToIndex: no song at index ${index}`);
      return;
    }
    await get().playSong(song);
  },

  // ── playNext ───────────────────────────────────────────────────────────────
  playNext: async () => {
    const { queue, currentSong, repeat } = get();
    if (!queue.length) return;
    const idx = queue.findIndex((s) => s.id === currentSong?.id);
    let nextIndex = idx + 1;
    if (nextIndex >= queue.length) {
      if (repeat === "all") nextIndex = 0;
      else return;
    }
    await get().skipToIndex(nextIndex);
  },

  // ── playPrevious ───────────────────────────────────────────────────────────
  playPrevious: async () => {
    const { queue, currentSong, position, repeat } = get();
    if (!queue.length) return;
    if (position > 3) {
      await get().seek(0);
      return;
    }
    const idx = queue.findIndex((s) => s.id === currentSong?.id);
    let prevIndex = idx - 1;
    if (prevIndex < 0) {
      if (repeat === "all") prevIndex = queue.length - 1;
      else return;
    }
    await get().skipToIndex(prevIndex);
  },

  // ── setIsPlaying ───────────────────────────────────────────────────────────
  setIsPlaying: async (isPlaying) => {
    try {
      if (isPlaying) await TrackPlayer.play();
      else await TrackPlayer.pause();
      set({ isPlaying });
    } catch (error) {
      console.error("[Player] Failed to toggle play state:", error);
    }
  },

  togglePlay: async () => {
    await get().setIsPlaying(!get().isPlaying);
  },

  // ── seek ───────────────────────────────────────────────────────────────────
  seek: async (pos) => {
    try {
      await TrackPlayer.seekTo(pos);
      set({ position: pos });
    } catch (error) {
      console.error("[Player] Seek failed:", error);
    }
  },

  // ── toggleShuffle / toggleRepeat ──────────────────────────────────────────
  toggleShuffle: () => set((s) => ({ shuffle: !s.shuffle })),

  toggleRepeat: () => {
    const map: Record<RepeatMode, RepeatMode> = {
      off: "all", all: "track", track: "off",
    };
    set((s) => ({ repeat: map[s.repeat] }));
  },

  // ── setPlaybackSpeed ───────────────────────────────────────────────────────
  setPlaybackSpeed: async (speed) => {
    try {
      await TrackPlayer.setRate(speed);
      set({ playbackSpeed: speed });
      await AsyncStorage.setItem(KEYS.SPEED, speed.toString());
    } catch (error) {
      console.error("[Player] Failed to set playback speed:", error);
    }
  },

  // ── setDefaultEQ ──────────────────────────────────────────────────────────
  setDefaultEQ: async (eq) => {
    set({ defaultEQ: eq });
    await AsyncStorage.setItem(KEYS.EQ, eq);
  },

  // ── setAudioMode ──────────────────────────────────────────────────────────
  setAudioMode: async (mode) => {
    try {
      await AsyncStorage.setItem(KEYS.MODE, mode);
      await audioEngine.toggleExclusiveMode(mode === "bit-perfect");
      set({ audioMode: mode });
      console.log(
        mode === "bit-perfect"
          ? "🚀 [Player] Bit-Perfect Active: DSP Bypassed"
          : "🎛️ [Player] DSP Mode Active",
      );
    } catch (e) {
      console.error("[Player] Failed to set audio mode:", e);
    }
  },

  // ── setSleepTimer ─────────────────────────────────────────────────────────
  setSleepTimer: (minutes) => {
    if (minutes === null) { set({ sleepTimerEnd: null }); return; }
    const endTime = Date.now() + minutes * 60_000;
    set({ sleepTimerEnd: endTime });
    setTimeout(() => {
      if (get().sleepTimerEnd === endTime) {
        get().setIsPlaying(false);
        set({ sleepTimerEnd: null });
      }
    }, minutes * 60_000);
  },

  // ── Simple setters ────────────────────────────────────────────────────────
  setCurrentSong: (song) => set({ currentSong: song }),
  setQueue: (songs) => set({ queue: songs }),

  // ✅ setPosition — throttle save ke AsyncStorage
  setPosition: (position) => {
    set({ position });
    savePositionThrottled(position);
  },

  setDuration:   (duration) => set({ duration }),
  setLyrics:     (lyrics)   => set({ lyrics }),
  clearPlayError: ()        => set({ playError: null }),

  // ── UI visibility ─────────────────────────────────────────────────────────
  setMainPlayerOpen:  (open) => set({ isMainPlayerOpen: open }),
  setVisualizerOpen:  (open) => set({ isVisualizerOpen: open }),
  setDrawerOpen:      (open) => set({ isDrawerOpen: open }),
  toggleMainPlayer:   ()     => set((s) => ({ isMainPlayerOpen: !s.isMainPlayerOpen })),
  resetFloatingPlayerVisibility: () => set({
    isMainPlayerOpen: false,
    isVisualizerOpen: false,
    isDrawerOpen: false,
  }),
}));

// ─────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────

function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// ─────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────

usePlayerStore.getState().initStore();
 