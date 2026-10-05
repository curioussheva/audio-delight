// src/features/player/store/playerStore.ts

import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { audioEngine } from "@/features/player/api/engine";
import { Song } from "@/shared/types/audio";
import { LibraryScanner } from "@/features/library/api/scanner";
import { SongQueries, db } from "@/shared/lib/sqlite";
import NativePlaybackService from "@/specs/NativePlaybackService";
import {
  findSongByUri,
  isPlayingFromStatus,
  shouldCorrectDuration,
  shouldRestartInsteadOfPrevious,
  uriMatches,
  validateQueueIndex,
} from "@/shared/utils/queueNavigation";

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
  // Indeks trek aktif menurut NATIVE (posisi di queue AKTIF, sudah
  // memperhitungkan shuffle). -1 kalau belum diketahui.
  // Dipakai untuk indicator "sedang diputar" supaya cocok dengan urutan
  // yang benar-benar diputar native saat shuffle menyala.
  currentIndex: number;
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
  // Baca ulang keadaan dari native: track aktif, indeks, status, posisi.
  // Dipakai setelah perintah navigasi supaya UI menampilkan apa yang
  // benar-benar dimuat native - termasuk perubahan dari tombol notification.
  syncFromNative: () => Promise<void>;
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
  currentIndex: -1,
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

    // 🔥 FIX #4: event native→JS untuk track-ended.
    //
    // Sebelumnya JS menebak-nebak: __trackEndWatcher polling tiap 1 detik,
    // deteksi "posisi stuck 3 detik" atau "pos >= dur - 500". Ini fragile:
    // kalau JS thread busy, deteksi telat; kalau duration salah, deteksi gagal.
    //
    // Sekarang C++ yang kasih tahu (DecoderWorker EOF callback →
    // NativePlaybackModule.onNativeTrackEnded → DeviceEventEmitter).
    // Polling __trackEndWatcher dihapus.
    if (!(globalThis as any).__nativeTrackEndListener) {
      const { NativeEventEmitter } = require("react-native");
      const emitter = new NativeEventEmitter(NativePlaybackService);
      const subscription = emitter.addListener(
        "onPlaybackTrackEnded",
          async (uri: string) => {
          console.log(`[Player] 🎵 native track-ended event: ${uri}`);
          const s = get();
          if (!s.currentSong) return;

          // Kalau URI yang berakhir = lagu yang sedang diputar JS, lanjut next.
          // Cek ini karena event bisa datang terlambat (user sudah skip manual).
          //
          // ⚠️ URI native bisa berbeda BENTUK dari currentSong.uri JS:
          // - JS mengirim content:// ke setQueue
          // - Kotlin me-resolve 5 trek pertama ke path cache
          //   (/data/.../cache/audio_<hash>.flac) sebelum kasih ke native
          // - trek deferred tetap content://
          // Jadi perbandingan string mentah gagal untuk trek yang sudah
          // di-resolve — padahal itu trek yang sedang diputar! Akibatnya
          // auto-advance UI tidak pernah jalan (audio native sudah next,
          // currentSong JS masih yang lama).
          if (uri && s.currentSong.uri && !uriMatches(s.currentSong.uri, uri)) {
            console.log(
              `[Player] 🎵 skip: uri event (${uri}) ≠ currentSong.uri (${s.currentSong.uri})`,
            );
            return;
          }

          // 🔥 C++ sudah advance queue di EOF callback (TrackQueue::advance).
          // Jadi kita hanya perlu sync dari native — JANGAN panggil
          // NativePlaybackService.next() lagi (double-advance).
          await get().syncFromNative();
        },
      );
      (globalThis as any).__nativeTrackEndListener = subscription;
      console.log("[Player] 🎵 Native track-ended listener registered");
    }

    // 🔥 FIX #4: event native→JS kalau user pencet next/prev di lock screen.
    // Native sudah ganti trek (PlaybackNativeBridge.next()), JS tinggal sync.
    if (!(globalThis as any).__nativeTrackChangedListener) {
      const { NativeEventEmitter } = require("react-native");
      const emitter = new NativeEventEmitter(NativePlaybackService);
      const subscription = emitter.addListener(
        "onPlaybackTrackChanged",
        async (payload: { uri: string; index: number } | string) => {
          // Payload bisa berupa Pair (Android) atau string polos.
          console.log("[Player] 🔀 native track-changed event:", payload);
          await get().syncFromNative();
        },
      );
      (globalThis as any).__nativeTrackChangedListener = subscription;
      console.log("[Player] 🔀 Native track-changed listener registered");
    }

    // 🔥 FIX: position+duration polling terpusat (bukan di hook useAudioPlayer)
    // Supaya slider progress bergerak walaupun hook unmount.
    if (!(globalThis as any).__positionWatcher) {
      let _posInFlight = false;
      let lastEmittedPos = -1; // 🔥 throttle untuk MediaSession sync
      (globalThis as any).__positionWatcher = setInterval(async () => {
        if (_posInFlight) return;
        const s = get();
        if (!s.currentSong) return;

        _posInFlight = true;
        try {
          const posMs = await NativePlaybackService.getPosition();
          const newPos = posMs / 1000;

          // Sync posisi ke Zustand (throttle: hanya update kalau berubah >0.1s)
          if (Math.abs(newPos - get().position) > 0.1) {
            set({ position: newPos });
          }

          // 🔥 FIX #2: sync posisi ke MediaSession supaya slider lock screen
          // ikut jalan. Throttle: hanya tiap ~1 detik (Math.floor) supaya
          // tidak spam bridge setiap 500ms dengan nilai yang berubah tipis.
          if (Math.floor(newPos) !== Math.floor(lastEmittedPos)) {
            lastEmittedPos = newPos;
            safeFireAndForget(
              () =>
                NativePlaybackService.updatePlaybackState(
                  get().isPlaying,
                  newPos * 1000,
                ),
              "updatePlaybackState(poll)",
            );
          }

          // Sync duration dari currentSong, TAPI koreksi kalau nilainya tidak
          // masuk akal. Sebelumnya hanya di-set kalau masih 0 (`curDur <= 0`),
          // jadi duration yang salah dari database (mis. hasil scan yang
          // gagal baca header) bertahan selamanya - progress bar mati dan
          // seek ke tengah lagu jadi tidak mungkin.
          const songDur = s.currentSong.duration ?? 0;
          if (shouldCorrectDuration(get().duration, songDur)) {
            set({ duration: songDur });
          }
        } catch (e) {
          // silent
        } finally {
          _posInFlight = false;
        }
      }, 500);
      console.log("[Player] 📊 Position watcher started (500ms)");
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

      // Native me-reject kalau dekoder gagal membuka track (mis. content://
      // yang belum di-resolve). Kalau hasilnya diabaikan, UI menampilkan lagu
      // "sedang diputar" tanpa suara - ini pernah terjadi pada logcat
      // 2026-10-04 12:22, tiga kali berturut-turut.
      try {
        await timedCall("play", () => NativePlaybackService.play());
      } catch (playErr) {
        console.error(
          `[Player] playSong: native play() GAGAL untuk "${playableSong.title}"`,
          playErr,
        );
        set({
          currentSong: playableSong,
          queue: targetQueue,
          isPlaying: false,
          position: 0,
          playError: "Gagal memutar lagu ini. Coba lagu lain.",
        });
        return false;
      }

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
            playableSong.artwork ?? null,
          ),
        "updateMetadata",
      );

      safeFireAndForget(
        () => NativePlaybackService.updatePlaybackState(true, 0),
        "updatePlaybackState",
      );

      // 🔥 MediaSession shuffle/repeat sync: kirim state awal supaya lock
      // screen langsung benar, tidak menunggu user toggle pertama.
      safeFireAndForget(
        () => NativePlaybackService.updateShuffleMode(get().shuffle),
        "updateShuffleMode(init)",
      );
      safeFireAndForget(
        () =>
          NativePlaybackService.updateRepeatMode(
            get().repeat === "off" ? 0 : get().repeat === "all" ? 1 : 2,
          ),
        "updateRepeatMode(init)",
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
    // Pindah ke indeks NATIVE. Sebelumnya fungsi ini memanggil playSong(song)
    // yang menimpa queue native lewat setQueue - itu membuang indeks dan
    // urutan shuffle yang sudah dihitung native, dan membuat next/prev
    // berperilaku berbeda dari tombol di notification.
    const queueSize = NativePlaybackService.getQueueSize();
    const valid = validateQueueIndex(index, queueSize);
    if (valid === null) {
      console.warn(
        `[Player] skipToIndex(${index}) ditolak: di luar jangkauan (queue=${queueSize})`,
      );
      return;
    }

    try {
      await NativePlaybackService.jumpTo(valid);
      await get().syncFromNative();
    } catch (e) {
      console.error(`[Player] skipToIndex(${valid}) gagal:`, e);
      set({ playError: "Tidak bisa pindah lagu." });
    }
  },

  // Baca ulang keadaan sebenarnya dari native (track aktif, indeks, status).
  // Dipanggil setelah setiap perintah navigasi supaya UI menampilkan apa yang
  // benar-benar dimuat native - termasuk kalau yang mengubah adalah tombol
  // di notification / lock screen, yang tidak lewat store.
  syncFromNative: async () => {
    try {
      const [uri, index, status, posMs] = await Promise.all([
        NativePlaybackService.getCurrentTrack(),
        Promise.resolve(NativePlaybackService.getCurrentIndex()),
        NativePlaybackService.getStatus(),
        NativePlaybackService.getPosition(),
      ]);

      const patch: Partial<PlayerState> = {
        // Hanya PLAYING yang dianggap true. Memakai `status !== 0` membuat
        // PAUSED ikut dianggap playing - tombol jadi menampilkan "pause"
        // padahal audio berhenti.
        isPlaying: isPlayingFromStatus(status),
        position: posMs / 1000,
      };

      // Cocokkan track native dengan song di queue store lewat URI, bukan
      // indeks: saat shuffle aktif, indeks di store tidak sama dengan indeks
      // native, jadi mencocokkan lewat indeks menampilkan lagu yang salah.
      const song = findSongByUri(get().queue, uri);
      if (song) patch.currentSong = song;

      // Indeks native juga disimpan supaya indicator "sedang diputar" di
      // daftar bisa mengikuti urutan native saat shuffle aktif. Native
      // sekarang melaporkan indeks di queue AKTIF (bukan urutan file).
      if (index >= 0) patch.currentIndex = index;

      set(patch);

      // Judul di notification harus ikut berubah setelah next/prev, kalau
      // tidak lock screen tetap menampilkan lagu lama.
      const cur = get().currentSong;
      if (cur) {
        safeFireAndForget(
          () =>
            NativePlaybackService.updateMetadata(
              cur.title ?? "Unknown Title",
              cur.artist ?? "Unknown Artist",
              cur.album ?? "",
              (cur.duration ?? 0) * 1000,
              cur.artwork ?? null,
            ),
          "updateMetadata(sync)",
        );
      }
    } catch (e) {
      // Tidak fatal: polling berkala akan menyusulkan state berikutnya.
      console.warn("[Player] syncFromNative gagal:", e);
    }
  },

  playNext: async () => {
    const { queue, currentSong, repeat } = get();
    if (!queue.length || !currentSong) return;

    // Native sudah punya queue lengkap. Perintahkan native maju, lalu
    // sinkronkan UI dari native - jangan hitung indeks di sini.
    //
    // Bedanya penting saat shuffle/repeat aktif: urutan sebenarnya hanya
    // diketahui native, jadi menghitung indeks di JS (pola lama) bisa memuat
    // lagu yang berbeda dari yang ditampilkan.
    try {
      await NativePlaybackService.next();
      await get().syncFromNative();
    } catch (e) {
      console.error("[Player] playNext gagal:", e);
      // Fallback: hanya kalau native menolak (mis. akhir queue dengan
      // repeat=off) dan JS masih bisa menentukan berikutnya.
      if (repeat === "all") await get().skipToIndex(0);
    }
  },

  playPrevious: async () => {
    const { queue, currentSong, position } = get();
    if (!queue.length || !currentSong) return;

    // Perilaku standar player: kalau sudah lewat ambang, "previous" berarti
    // ulang lagu ini, bukan pindah ke lagu sebelumnya.
    if (shouldRestartInsteadOfPrevious(position)) {
      await get().seek(0);
      return;
    }

    try {
      await NativePlaybackService.previous();
      await get().syncFromNative();
    } catch (e) {
      console.error("[Player] playPrevious gagal:", e);
    }
  },

  setIsPlaying: async (isPlaying: boolean) => {
    try {
      if (isPlaying) {
        // Kalau native menolak (dekoder gagal), jangan tandai playing.
        try {
          await timedCall("play", () => NativePlaybackService.play());
        } catch (playErr) {
          console.error("[Player] setIsPlaying(true): native play() GAGAL", playErr);
          set({ isPlaying: false });
          return;
        }
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

      // 🔥 FIX #2: setelah seek, MediaSession harus tahu posisi baru.
      // Sebelumnya slider lock screen masih nunjukkin posisi lama sampai
      // user play/pause berikutnya.
      safeFireAndForget(
        () => NativePlaybackService.updatePlaybackState(get().isPlaying, pos * 1000),
        "updatePlaybackState(seek)",
      );
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
    // 🔥 FIX #3: sync ke MediaSession supaya lock screen ikut.
    safeFireAndForget(
      () => NativePlaybackService.updateShuffleMode(next),
      "updateShuffleMode",
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
    // 🔥 FIX #3: sync ke MediaSession supaya lock screen ikut.
    safeFireAndForget(
      () => NativePlaybackService.updateRepeatMode(nativeMode),
      "updateRepeatMode",
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