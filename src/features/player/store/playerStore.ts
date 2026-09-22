// src/features/player/store/playerStore.ts

import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { audioEngine } from "@/features/player/api/engine";
import { Song } from "@/shared/types/audio";
import { LibraryScanner } from "@/features/library/api/scanner";
import { SongQueries, db } from "@/shared/lib/sqlite";
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

// 🔥 FIX Bug #1: dedupe concurrent playSong (crash saat tap cepat)
const _playInFlightSongIds = new Set<string>();
let _lastPlayRequest: { songId: string; ts: number } | null = null;
const savePositionThrottled = (position: number) => {
  if (_positionSaveTimer) return;
  _positionSaveTimer = setTimeout(() => {
    AsyncStorage.setItem(KEYS.LAST_POSITION, position.toString()).catch(
      () => {},
    );
    _positionSaveTimer = null;
  }, 5000);
};

// ─────────────────────────────────────────────
// 🔥 PERF TELEMETRY HELPER
// Detect apakah native call sync/async + timing
// ─────────────────────────────────────────────
async function timedCall<T>(
  label: string,
  fn: () => T | Promise<T>,
): Promise<T> {
  const t0 = Date.now();
  try {
    const result = fn();
    const isPromise = result && typeof (result as any).then === "function";
    const final = isPromise ? await (result as Promise<T>) : (result as T);
    const ms = Date.now() - t0;
    console.log(`[PERF] ${label}: ${ms}ms (async=${!!isPromise})`);
    return final;
  } catch (e) {
    const ms = Date.now() - t0;
    console.error(`[PERF] ${label}: FAILED in ${ms}ms`, e);
    throw e;
  }
}

// ─────────────────────────────────────────────
// 🔥 SAFE FIRE-AND-FORGET
// Handle both sync (void) and async (Promise) native methods.
// ─────────────────────────────────────────────
function safeFireAndForget(fn: () => any, label: string): void {
  try {
    const result = fn();
    if (result && typeof result.then === "function") {
      (result as Promise<any>).catch((e: any) =>
        console.warn(`[Player] ${label} failed:`, e),
      );
    }
  } catch (e) {
    console.warn(`[Player] ${label} threw:`, e);
  }
}

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

          // 🟢 Restore state di React/Zustand.
          // Native queue TIDAK di-restore di sini (mahal + permission leak).
          // Akan di-restore lazy saat user tap play.
          set({
            queue: restoredQueue,
            currentSong,
            position: lastPosition,
            isPlaying: false,   // 🔥 Explicit: native tidak playing
          });

          console.log(
            `[Player] 🔄 Restored state: "${currentSong.title}", queue=${restoredQueue.length}, pos=${lastPosition}s`
          );
          console.log("[Player] ⚠️  Native queue empty — re-sync on play");
        }
      }
    } catch (e) {
      console.error("[Player] Failed to init PlayerStore:", e);
    }

    // 🔥 FIX v2: auto-next watcher baca posisi LANGSUNG dari native
    // Tidak bergantung pada useAudioPlayer mounted atau tidak.
    // Overhead: 1 native call per detik (negligible).
    if (!(globalThis as any).__trackEndWatcher) {
      let _inFlight = false;
      (globalThis as any).__trackEndWatcher = setInterval(async () => {
        if (_inFlight) return;  // cegah overlap kalau native lambat
        const s = get();
        if (!s.isPlaying || !s.currentSong) return;
        const durMs = (s.currentSong.duration ?? 0) * 1000;
        if (durMs <= 0) return;

        _inFlight = true;
        try {
          const nativePosMs = await NativePlaybackService.getPosition();
          if (
            nativePosMs >= durMs - 500 &&
            nativePosMs < durMs + 5000
          ) {
            console.log(
              `[Player] 🎵 track ended (native=${nativePosMs}ms, dur=${durMs}ms) → next`,
            );
            await get().playNext();
          }
        } catch (e) {
          // silent — akan retry tick berikutnya
        } finally {
          _inFlight = false;
        }
      }, 1000);
      console.log("[Player] 🎵 Auto-next watcher started (native-based)");
    }
  },

  // ── Core Playback ────────────────────────────────────────────────────────
  playSong: async (song: Song, newQueue?: Song[]): Promise<boolean> => {
    const t0 = Date.now();

    if (!song?.id) {
      console.error("[Player] playSong: invalid song");
      set({ playError: "Invalid song" });
      return false;
    }

    // 🔥 FIX Bug #1: dedupe concurrent playSong (cegah crash saat tap cepat)
    // Layer 1: cek in-flight (Set) — kalau ada play yang sedang jalan, skip
    if (_playInFlightSongIds.has(song.id)) {
      console.log(`[Player] 🚫 dedupe playSong (in-flight): ${song.id}`);
      return true;
    }
    // Layer 2: cek rapid re-tap — kalau < 1s, skip juga
    {
      const _now = Date.now();
      if (
        _lastPlayRequest?.songId === song.id &&
        _now - _lastPlayRequest.ts < 1000
      ) {
        console.log(`[Player] 🚫 dedupe playSong (rapid re-tap): ${song.id}`);
        return true;
      }
      _lastPlayRequest = { songId: song.id, ts: _now };
      _playInFlightSongIds.add(song.id);
      // Safety cleanup: auto-release setelah 20s (max durasi setQueue terlihat 15s)
      setTimeout(() => _playInFlightSongIds.delete(song.id), 20_000);
    }

    const state = get();
    if (state.currentSong?.id === song.id && state.isPlaying) {
      console.log("[PERF] playSong: already playing same track, skip");
      return true;
    }

    let playableSong: Song = song.uri ? { ...song } : await recoverUri(song);

    console.log(`▶️ [Player] playSong: "${playableSong.title}"`);

    let targetQueue = newQueue ?? state.queue;
    if (targetQueue.length === 0) {
      set({ playError: "Queue is empty" });
      return false;
    }

    // 🔥 FIX: native TrackQueue::setTracks() selalu set currentIndex=0.
    // Kalau lagu yang di-tap tidak berada di index 0 (misal karena
    // slice ±N di library.tsx), native akan load track yang SALAH.
    // Reorder queue di sini supaya lagu yang di-tap selalu index 0.
    const tapIndex = targetQueue.findIndex((s) => s.id === playableSong.id);
    if (tapIndex > 0) {
      targetQueue = [
        ...targetQueue.slice(tapIndex),
        ...targetQueue.slice(0, tapIndex),
      ];
    }

    try {
      // ── 1. Filter URIs ─────────────────────────────────
      const tFilter0 = Date.now();
      const uris = targetQueue.map((s) => s.uri).filter((uri) => !!uri);
      if (uris.length === 0) {
        set({ playError: "No valid URIs" });
        return false;
      }
      const tFilter = Date.now() - tFilter0;
      console.log(
        `[PERF] filter URIs: ${tFilter}ms (${uris.length}/${targetQueue.length} valid)`,
      );
      console.log(
        "🔍 [DEBUG] URIs dikirim ke native:",
        JSON.stringify(uris.slice(0, 3)),
      );

      // ── 2. setQueue (dengan await!) ────────────────────
      await timedCall("setQueue", () => NativePlaybackService.setQueue(uris));

      // ── 3. play (dengan await!) ────────────────────────
      await timedCall("play", () => NativePlaybackService.play());

// ── 4. State update ────────────────────────────────
      // 🔥 RESTORE POSITION: kalau resume after restart
      const isResumeAfterRestart =
        state.currentSong?.id === playableSong.id &&
        state.position > 0;

      const resumePosition = isResumeAfterRestart ? state.position : 0;

      set({
        currentSong: playableSong,
        queue: targetQueue,
        isPlaying: true,
        position: resumePosition,
        playError: null,
      });

      // 🔥 Seek ke restored position (setelah decoder siap)
      if (resumePosition > 0) {
        console.log(`[Player] 🔄 Resume from position: ${resumePosition}s`);
        setTimeout(async () => {
          try {
            await NativePlaybackService.seek(resumePosition * 1000);
            console.log(`[Player] ✅ Seek to ${resumePosition}s done`);
          } catch (e) {
            console.warn("[Player] Restore seek failed:", e);
          }
        }, 500);  // delay 500ms biar decoder siap
      }

      // 🔥 FIX: safe fire-and-forget (support sync & async native method)
      safeFireAndForget(
        () =>
          NativePlaybackService.updateMetadata(
            playableSong.title ?? "Unknown Title",
            playableSong.artist ?? "Unknown Artist",
            playableSong.album ?? "",
            (playableSong.duration ?? 0) * 1000,
          ),
        "updateMetadata",
      );

      safeFireAndForget(
        () => NativePlaybackService.updatePlaybackState(true, 0),
        "updatePlaybackState",
      );

      AsyncStorage.setItem(KEYS.LAST_SONG_ID, playableSong.id).catch(() => {});
      AsyncStorage.setItem(
        KEYS.LAST_QUEUE_IDS,
        JSON.stringify(targetQueue.map((s) => s.id)),
      ).catch(() => {});
      AsyncStorage.setItem(KEYS.LAST_POSITION, "0").catch(() => {});

      SongQueries.incrementPlayCount?.(playableSong.id, 0);

      const totalMs = Date.now() - t0;
      console.log(`[PERF] playSong TOTAL: ${totalMs}ms`);

      return true;
    } catch (error: any) {
      const totalMs = Date.now() - t0;
      console.error(`❌ [Player] playSong failed (${totalMs}ms):`, error);
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
      if (isPlaying) {
        await timedCall("play", () => NativePlaybackService.play());
      } else {
        await timedCall("pause", () => NativePlaybackService.pause());
      }
      set({ isPlaying });

      // 🔥 FIX: sync playback state ke MediaSession (safe)
      const pos = get().position;
      safeFireAndForget(
        () => NativePlaybackService.updatePlaybackState(isPlaying, pos * 1000),
        "updatePlaybackState",
      );
    } catch (error) {
      console.error("[Player] setIsPlaying failed:", error);
    }
  },
 
  togglePlay: async () => get().setIsPlaying(!get().isPlaying),

  seek: async (pos: number) => {
    try {
      await timedCall("seek", () => NativePlaybackService.seek(pos * 1000));
      set({ position: pos });
    } catch (error) {
      console.error("[Player] Seek failed:", error);
    }
  },

  toggleShuffle: () => {
    const next = !get().shuffle;
    set({ shuffle: next });
    // 🔥 FIX: kirim ke native (sebelumnya cuma update Zustand)
    safeFireAndForget(
      () => NativePlaybackService.setShuffle(next),
      "setShuffle",
    );
    console.log(`[Player] shuffle=${next} → native`);
  },

  toggleRepeat: () => {
    const map: Record<RepeatMode, RepeatMode> = {
      off: "all",
      all: "track",
      track: "off",
    };
    const next = map[get().repeat];
    set({ repeat: next });
    // 🔥 FIX: kirim ke native (0=off, 1=all, 2=track)
    const nativeMode = next === "off" ? 0 : next === "all" ? 1 : 2;
    safeFireAndForget(
      () => NativePlaybackService.setRepeatMode(nativeMode),
      "setRepeatMode",
    );
    console.log(`[Player] repeat=${next} (native=${nativeMode})`);
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
  toggleMainPlayer: () => set((s) => ({ isMainPlayerOpen: !s.isMainPlayerOpen })),
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