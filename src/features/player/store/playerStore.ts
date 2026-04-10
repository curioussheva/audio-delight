import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import TrackPlayer from "react-native-track-player";
import { audioEngine } from "@/features/player/api/engine";
import { Song } from "@/shared/types/audio";
import { LibraryScanner } from "@/features/library/api/scanner";

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
  console.log(
    `[Player] Missing URI for "${song.title}", trying to recover from DB...`,
  );
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

/**
 * Returns how many tracks are currently loaded in the TrackPlayer queue.
 * Used to detect a stale/reset queue before attempting skip.
 */
const getTrackPlayerQueueSize = async (): Promise<number> => {
  try {
    const queue = await TrackPlayer.getQueue();
    return queue.length;
  } catch {
    return 0;
  }
};

// ─────────────────────────────────────────────
// State interface
// ─────────────────────────────────────────────

export interface PlayerState {
  // Playback
  currentSong: Song | null;
  queue: Song[];
  isPlaying: boolean;
  position: number;
  duration: number;
  // Settings
  shuffle: boolean;
  repeat: RepeatMode;
  playbackSpeed: number;
  defaultEQ: string;
  audioMode: AudioMode;
  // Misc
  lyrics: LyricLine[];
  sleepTimerEnd: number | null;
  playError: string | null;
  // UI visibility
  isMainPlayerOpen: boolean;
  isVisualizerOpen: boolean;
  isDrawerOpen: boolean;

  // Actions
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
  // Setters (for PlaybackService sync)
  setCurrentSong: (song: Song | null) => void;
  setQueue: (songs: Song[]) => void;
  setPosition: (position: number) => void;
  setDuration: (duration: number) => void;
  setLyrics: (lyrics: LyricLine[]) => void;
  clearPlayError: () => void;
  // UI
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
  // ── Initial state ──────────────────────────
  currentSong: null,
  queue: [],
  isPlaying: false,
  position: 0,
  duration: 0,
  shuffle: false,
  repeat: "off",
  playbackSpeed: 1.0,
  defaultEQ: "Flat",
  audioMode: "dsp",
  lyrics: [],
  sleepTimerEnd: null,
  playError: null,
  isMainPlayerOpen: false,
  isVisualizerOpen: false,
  isDrawerOpen: false,

  // ── initStore ──────────────────────────────
  initStore: async () => {
    try {
      const [speed, eq, mode, savedQueue, lastSong] = await Promise.all([
        AsyncStorage.getItem("playback_speed"),
        AsyncStorage.getItem("default_eq"),
        AsyncStorage.getItem("audio_mode_preference"),
        AsyncStorage.getItem("last_queue"),
        AsyncStorage.getItem("last_song"),
      ]);

      set({
        ...(speed ? { playbackSpeed: parseFloat(speed) } : {}),
        ...(eq ? { defaultEQ: eq } : {}),
        ...(mode ? { audioMode: mode as AudioMode } : {}),
        ...(lastSong
          ? { currentSong: safeJsonParse<Song | null>(lastSong, null) }
          : {}),
        ...(savedQueue
          ? { queue: safeJsonParse<Song[]>(savedQueue, []) }
          : {}),
      });
    } catch (e) {
      console.error("[Player] Failed to init PlayerStore:", e);
    }
  },

  // ── playSong ───────────────────────────────
  //
  // Decision tree:
  //   newQueue provided          → always reset TP queue + load newQueue
  //   newQueue omitted
  //     TP queue size matches    → plain skip (fast path, no reset)
  //     TP queue is stale/empty  → silently reload store queue, then skip
  //
  playSong: async (song: Song, newQueue?: Song[]): Promise<boolean> => {
    if (!song?.id) {
      console.error("[Player] playSong: invalid song object");
      set({ playError: "Invalid song" });
      return false;
    }

    // ── 1. Duplicate guard ─────────────────────────────────────────────────
    const state = get();
    if (state.currentSong?.id === song.id && state.isPlaying) {
      console.log(`[Player] Already playing "${song.title}", skipping`);
      return true;
    }

    // ── 2. URI recovery ────────────────────────────────────────────────────
    let playableSong: Song = song.uri ? { ...song } : await recoverUri(song);

    console.log(
      `▶️ [Player] playSong: "${playableSong.title}" | URI: ${
        playableSong.uri
          ? playableSong.uri.substring(0, 60) + "..."
          : "NO URI"
      }`,
    );

    // ── 3. Resolve target queue ────────────────────────────────────────────
    const targetQueue = newQueue ?? state.queue;
    if (targetQueue.length === 0) {
      console.error("[Player] playSong: queue is empty");
      set({ playError: "Queue is empty" });
      return false;
    }

    const songIndex = targetQueue.findIndex((s) => s.id === playableSong.id);
    const skipIndex = songIndex !== -1 ? songIndex : 0;

    // ── 4. Determine whether TP queue needs to be (re)loaded ───────────────
    //   Force reload if:
    //     a) Caller explicitly passed newQueue, OR
    //     b) TrackPlayer queue is empty/stale (e.g. after an external reset)
    const tpQueueSize = await getTrackPlayerQueueSize();
    const needsReload = !!newQueue || tpQueueSize !== targetQueue.length;

    if (needsReload && !newQueue) {
      console.log(
        `[Player] TP queue stale (${tpQueueSize} vs ${targetQueue.length}), reloading...`,
      );
    }

    // ── 5. Execute playback ────────────────────────────────────────────────
    try {
      if (needsReload) {
        await TrackPlayer.reset();
        const tracks = targetQueue.map(songToTrack).filter((t) => !!t.url);
        if (tracks.length === 0) throw new Error("No valid tracks with URL");
        await TrackPlayer.add(tracks);
        console.log(`[Player] Added ${tracks.length} tracks to queue`);

        if (newQueue) {
          AsyncStorage.setItem(
            "last_queue",
            JSON.stringify(targetQueue),
          ).catch(() => {});
        }
      }

      // Single skip → single PlaybackActiveTrackChanged event
      await TrackPlayer.skip(skipIndex);
      await TrackPlayer.play();

      // ── 6. Commit state AFTER successful play ────────────────────────────
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

      AsyncStorage.setItem("last_song", JSON.stringify(playableSong)).catch(
        () => {},
      );

      return true;
    } catch (error: any) {
      console.error("❌ [Player] playSong failed:", error);
      set({ isPlaying: false, playError: error?.message ?? "Playback failed" });
      return false;
    }
  },

  // ── skipToIndex ────────────────────────────
  // Skip to index in store queue. Reuse playSong so stale-queue
  // detection runs automatically.
  skipToIndex: async (index: number) => {
    const { queue } = get();
    const song = queue[index];
    if (!song) {
      console.warn(`[Player] skipToIndex: no song at index ${index}`);
      return;
    }
    // newQueue = undefined → fast-path skip if TP queue is still healthy
    await get().playSong(song);
  },

  // ── playNext ───────────────────────────────
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

  // ── playPrevious ───────────────────────────
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

  // ── setIsPlaying ───────────────────────────
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

  // ── seek ───────────────────────────────────
  seek: async (pos) => {
    try {
      await TrackPlayer.seekTo(pos);
      set({ position: pos });
    } catch (error) {
      console.error("[Player] Seek failed:", error);
    }
  },

  // ── toggleShuffle / toggleRepeat ──────────
  toggleShuffle: () => set((s) => ({ shuffle: !s.shuffle })),

  toggleRepeat: () => {
    const map: Record<RepeatMode, RepeatMode> = {
      off: "all",
      all: "track",
      track: "off",
    };
    set((s) => ({ repeat: map[s.repeat] }));
  },

  // ── setPlaybackSpeed ───────────────────────
  setPlaybackSpeed: async (speed) => {
    try {
      await TrackPlayer.setRate(speed);
      set({ playbackSpeed: speed });
      await AsyncStorage.setItem("playback_speed", speed.toString());
    } catch (error) {
      console.error("[Player] Failed to set playback speed:", error);
    }
  },

  // ── setDefaultEQ ──────────────────────────
  setDefaultEQ: async (eq) => {
    set({ defaultEQ: eq });
    await AsyncStorage.setItem("default_eq", eq);
  },

  // ── setAudioMode ──────────────────────────
  setAudioMode: async (mode) => {
    try {
      await AsyncStorage.setItem("audio_mode_preference", mode);
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

  // ── setSleepTimer ─────────────────────────
  setSleepTimer: (minutes) => {
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

  // ── Simple setters ─────────────────────────
  setCurrentSong: (song) => set({ currentSong: song }),
  setQueue: (songs) => set({ queue: songs }),
  setPosition: (position) => set({ position }),
  setDuration: (duration) => set({ duration }),
  setLyrics: (lyrics) => set({ lyrics }),
  clearPlayError: () => set({ playError: null }),

  // ── UI visibility ──────────────────────────
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
 