// src/features/player/store/playerStore.ts

import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { audioEngine } from "@/features/player/api/engine";
import { Song } from "@/shared/types/audio";
import { LibraryScanner } from "@/features/library/api/scanner";
import {
  songLyricsToLines,
  loadLyricsForSong,
} from "@/features/library/services/lyricsSource";
import { SongQueries, db } from "@/shared/lib/sqlite";
import NativePlaybackService from "@/specs/NativePlaybackService";
import NativeDSPModule from "@/features/equalizer/api/nativeInterface";
import { clampTuningCents } from "@/features/player/utils/tuning";
import { parseRepeatShuffleEvent } from "@/features/player/utils/repeatShuffle";
import {
  DEFAULT_SOLFEGEGGIO_FREQ,
  DEFAULT_SOLFEGEGGIO_TEMPLATE_ID,
  activeSolfeggioTemplateId,
  clampSolfeggioFreq,
  getSolfeggioTemplate,
} from "@/features/equalizer/api/solfeggioTemplates";
import {
  findSongByUri,
  isPlayingFromStatus,
  shouldCorrectDuration,
  shouldRestartInsteadOfPrevious,
  uriMatches,
  validateQueueIndex,
} from "@/shared/utils/queueNavigation";
import { isHiRes } from "@/shared/utils/audioQuality";

export interface LyricLine {
  time: number;
  text: string;
}

export type RepeatMode = "off" | "all" | "track";

/**
 * Mode pemrosesan audio. Tiga mode, sesuai prinsip desain app.
 *
 * - `bit-perfect` : DSP dilewati sepenuhnya. bit-perfect HANYA tercapai kalau
 *                   syarat jalurnya terpenuhi (device langsung/exclusive,
 *                   dan laju file didukung). Kalau tidak, audio TETAP jalan -
 *                   hanya melewati mixer (status dilaporkan, tidak diblokir).
 * - `dsp`         : DSP chain aktif (EQ, bass boost, limiter, stereo width).
 * - `immersive`   : DSP + rantai immersive (solfeggio, harmonic, spatial,
 *                   brainwave).
 *
 * Pilihan mode TIDAK memblokir pemutaran: apa pun mode-nya, audio selalu
 * berbunyi. Mode hanya menentukan pemrosesan.
 */
export type AudioMode = "bit-perfect" | "dsp" | "immersive";

// AsyncStorage keys
const KEYS = {
  SPEED: "playback_speed",
  TUNING_CENTS: "tuning_cents",
  RESONANCE_INTENSITY: "resonance_intensity",
  SOLFEGGIO_FREQ: "solfeggio_freq",
  SOLFEGGIO_TEMPLATE: "solfeggio_template",
  MODE: "audio_mode_preference",
  LAST_SONG_ID: "last_song_id",
  LAST_QUEUE_IDS: "last_queue_ids",
  LAST_POSITION: "last_position",
} as const;

let _positionSaveTimer: ReturnType<typeof setTimeout> | null = null;

// 🔥 FIX Bug #1: dedupe concurrent playSong (crash saat tap cepat)
const _playInFlightSongIds = new Set<string>();
// C4.2 (Batch 18): handle timer backstop per lagu, supaya timer panggilan
// lama bisa dibatalkan saat playSong selesai (lihat finally di playSong).
const _playInFlightTimers = new Map<string, ReturnType<typeof setTimeout>>();
let _lastPlayRequest: { songId: string; ts: number } | null = null;

// J1-3 fix 2 (Batch JS-1): coalesce sync pergantian trek. Satu navigasi
// bisa memicu handleTrackChanged dua kali berurutan — auto-advance native
// meng-emit onPlaybackTrackEnded DAN onPlaybackTrackChanged untuk advance
// yang sama (lihat onNativeTrackEnded di NativePlaybackModule.kt) — dan
// tanpa guard dua syncFromNative berjalan bersamaan (4 bridge call +
// updateMetadata masing-masing). Flag in-flight + pending memastikan
// paling banyak satu sync berjalan; pemicu yang datang saat sync berjalan
// tidak hilang, tapi dijalankan sekali setelahnya (bukan ditumpuk).
let _trackChangedSyncInFlight = false;
let _trackChangedSyncPending: string | null = null;
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
  tuningCents: number;
  // Intensitas master Solfeggio (0..1, default 0.5 = default native
  // ImmersiveStage). Satu nilai untuk resonansi + exciter + spatial.
  resonanceIntensity: number;
  // Frekuensi resonator Solfeggio (Hz, default 528 = default native).
  // Template yang dipilih user ("fokus", "tenang", …) atau "kustom" kalau
  // frekuensi/intensitas tidak lagi cocok dengan template mana pun.
  solfeggioFreq: number;
  solfeggioTemplateId: string;
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
  // J1-3 fix 2: SATU corong penanganan pergantian trek dari semua jalur
  // (in-app next/prev/skip, event native track-changed, auto-advance
  // track-ended). Setiap jalur memanggil ini — bukan syncFromNative
  // langsung — supaya tidak ada jalur yang diam dan supaya pemicu ganda
  // untuk satu navigasi di-coalesce (lihat flag _trackChangedSync*).
  // syncFromNative sendiri tetap dipakai jalur lain (sync-on-wake,
  // playback-state) dan tetap idempotent (playCount dijaga guard id).
  handleTrackChanged: (source: string) => Promise<void>;
  setIsPlaying: (isPlaying: boolean) => Promise<void>;
  togglePlay: () => Promise<void>;
  seek: (pos: number) => Promise<void>;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  setPlaybackSpeed: (speed: number) => Promise<void>;
  setTuningCents: (cents: number) => Promise<void>;
  setResonanceIntensity: (intensity: number) => Promise<void>;
  setSolfeggioFreq: (freq: number) => Promise<void>;
  setSolfeggioTemplate: (id: string) => Promise<void>;
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
  tuningCents: 0,
  resonanceIntensity: 0.5,
  solfeggioFreq: DEFAULT_SOLFEGEGGIO_FREQ,
  solfeggioTemplateId: DEFAULT_SOLFEGEGGIO_TEMPLATE_ID,
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
      const [
        speed,
        tuningCents,
        resonanceIntensity,
        solfeggioFreqRaw,
        solfeggioTemplateRaw,
        mode,
        lastSongId,
        lastQueueIdsRaw,
        lastPositionRaw,
      ] = await Promise.all([
          AsyncStorage.getItem(KEYS.SPEED),
          AsyncStorage.getItem(KEYS.TUNING_CENTS),
          AsyncStorage.getItem(KEYS.RESONANCE_INTENSITY),
          AsyncStorage.getItem(KEYS.SOLFEGGIO_FREQ),
          AsyncStorage.getItem(KEYS.SOLFEGGIO_TEMPLATE),
          AsyncStorage.getItem(KEYS.MODE),
          AsyncStorage.getItem(KEYS.LAST_SONG_ID),
          AsyncStorage.getItem(KEYS.LAST_QUEUE_IDS),
          AsyncStorage.getItem(KEYS.LAST_POSITION),
        ]);

      // Frekuensi + template Solfeggio tersimpan. Template tersimpan
      // dipakai hanya kalau masih cocok dengan frekuensi/intensitas
      // tersimpan; kalau tidak, diturunkan dari pasangan nilainya
      // (bisa jadi "kustom").
      const restoredIntensity = resonanceIntensity
        ? Math.min(1, Math.max(0, parseFloat(resonanceIntensity)))
        : 0.5;
      const restoredFreq = solfeggioFreqRaw
        ? clampSolfeggioFreq(parseFloat(solfeggioFreqRaw))
        : DEFAULT_SOLFEGEGGIO_FREQ;
      const restoredTemplate =
        solfeggioTemplateRaw &&
        getSolfeggioTemplate(solfeggioTemplateRaw)?.freq === restoredFreq &&
        getSolfeggioTemplate(solfeggioTemplateRaw)?.intensity ===
          restoredIntensity
          ? solfeggioTemplateRaw
          : activeSolfeggioTemplateId(restoredFreq, restoredIntensity);

      set({
        ...(speed ? { playbackSpeed: parseFloat(speed) } : {}),
        ...(tuningCents ? { tuningCents: parseFloat(tuningCents) } : {}),
        ...(resonanceIntensity
          ? {
              resonanceIntensity: restoredIntensity,
            }
          : {}),
        ...(solfeggioFreqRaw ? { solfeggioFreq: restoredFreq } : {}),
        ...(solfeggioFreqRaw || solfeggioTemplateRaw
          ? { solfeggioTemplateId: restoredTemplate }
          : {}),
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

    // J1-6 (Batch JS-1): SATU NativeEventEmitter bersama untuk semua event
    // native→JS (dulu 4 emitter, satu per event — redundan, hanya boros
    // objek). Emitter dibuat sekali dan disimpan di globalThis; tiap
    // listener di bawah tetap dijaga guard singleton-nya sendiri supaya
    // initStore yang dipanggil ulang tidak double-subscribe. Perilaku
    // emit/listen tidak berubah — hanya konsolidasi emitter.
    if (!(globalThis as any).__nativePlayerEmitter) {
      const { NativeEventEmitter } = require("react-native");
      (globalThis as any).__nativePlayerEmitter = new NativeEventEmitter(
        NativePlaybackService,
      );
    }
    const nativeEmitter = (globalThis as any).__nativePlayerEmitter;

    if (!(globalThis as any).__nativeTrackEndListener) {
      const subscription = nativeEmitter.addListener(
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
          const matches = uriMatches(s.currentSong.uri, uri);
          if (uri && s.currentSong.uri && !matches) {
            console.log(
              `[Player] 🎵 skip: uri event (${uri}) ≠ currentSong.uri (${s.currentSong.uri})`,
            );

            // 🔥 FIX (2026-10-06): jangan cuma skip — TETAP syncFromNative.
            //
            // Kenapa: kalau native sudah advance (auto-advance atau lock
            // screen next) tapi event sampai setelah JS update, atau kalau
            // native main trek yang berbeda (bug shuffle lama / queue
            // berubah), currentSong JS jadi TIDAK SAMA dengan yang sedang
            // dimainkan. UI nunjukin trek lama, speaker main trek baru —
            // itulah desync yang dikeluhkan.
            //
            // syncFromNative membaca current track native dan mengupdate
            // currentSong JS ke trek yang BENAR-BENAR diputar sekarang.
            // Kalau ternyata sama, tidak ada yang berubah (no-op). Kalau
            // beda, UI jadi benar. Idempoten dan aman dipanggil berulang.
            await get().handleTrackChanged("track-ended");
            return;
          }

          // 🔥 C++ sudah advance queue di EOF callback (TrackQueue::advance).
          // Jadi kita hanya perlu sync dari native — JANGAN panggil
          // NativePlaybackService.next() lagi (double-advance).
          await get().handleTrackChanged("track-ended");
        },
      );
      (globalThis as any).__nativeTrackEndListener = subscription;
      console.log("[Player] 🎵 Native track-ended listener registered");
    }

    // 🔥 FIX (2026-10-10): event native→JS untuk play/pause/seek/stop yang
    // dipicu dari notification / lock screen / bluetooth / media button.
    // Sebelumnya UI React hanya tahu lewat polling 500ms, jadi tombol UI
    // ketinggalan vs notifikasi.
    if (!(globalThis as any).__nativePlaybackStateListener) {
      const subscription = nativeEmitter.addListener(
        "onPlaybackStateChanged",
        async (isPlaying: boolean) => {
          console.log("[Player] ▶️ native playback-state event:", isPlaying);
          set({ isPlaying });

          // Sinkronkan juga posisi + trek supaya slider dan judul benar —
          // kalau seek dari notif, posisi UI harus ikut.
          await get().syncFromNative();
        },
      );
      (globalThis as any).__nativePlaybackStateListener = subscription;
      console.log("[Player] ▶️ Native playback-state listener registered");
    }

    // 🔥 FIX #4: event native→JS kalau user pencet next/prev di lock screen.
    // Native sudah ganti trek (PlaybackNativeBridge.next()), JS tinggal sync.
    if (!(globalThis as any).__nativeTrackChangedListener) {
      const subscription = nativeEmitter.addListener(
        "onPlaybackTrackChanged",
        async (payload: { uri: string; index: number }) => {
          // Payload selalu WritableMap {uri, index} dari
          // PlaybackNativeBridge.emitTrackChanged (B15-K-b); dulu
          // androidx Pair yang ditolak Arguments.fromJavaArgs.
          console.log("[Player] 🔀 native track-changed event:", payload);
          await get().handleTrackChanged("track-changed");
        },
      );
      (globalThis as any).__nativeTrackChangedListener = subscription;
      console.log("[Player] 🔀 Native track-changed listener registered");
    }

    // 🔥 FIX (Cleanup-4, 2026-11-15): event native→JS untuk repeat/shuffle
    // yang diubah dari lock screen / Android Auto (MediaSession callback
    // onSetRepeatMode/onSetShuffleMode → MediaSessionManager.update* →
    // PlaybackNativeBridge.emitRepeatShuffleChanged). Sebelumnya UI hanya
    // tahu lewat sync berikutnya — toggle di lock screen tidak tercermin
    // sampai track berganti. Listener HANYA set state (tanpa panggil balik
    // ke native), jadi tidak ada loop dengan jalur JS→native.
    if (!(globalThis as any).__nativeRepeatShuffleListener) {
      const subscription = nativeEmitter.addListener(
        "onPlaybackRepeatShuffleChanged",
        (payload: { repeatMode: string; shuffle: boolean }) => {
          // Payload selalu WritableMap {repeatMode, shuffle} dari
          // PlaybackNativeBridge.emitRepeatShuffleChanged; repeatMode
          // string "off"|"all"|"track" sesuai RepeatMode store.
          const parsed = parseRepeatShuffleEvent(payload);
          if (!parsed) {
            console.warn(
              "[Player] 🔁 native repeat/shuffle event tak valid, diabaikan:",
              payload,
            );
            return;
          }
          console.log("[Player] 🔁 native repeat/shuffle event:", parsed);
          set({ repeat: parsed.repeat, shuffle: parsed.shuffle });
        },
      );
      (globalThis as any).__nativeRepeatShuffleListener = subscription;
      console.log("[Player] 🔁 Native repeat/shuffle listener registered");
    }

    // J1-3 fix 1 (Batch JS-1): sync-on-wake. Jalur next() in-app dan
    // notifikasi tidak emit track-changed, jadi saat JS tidur/beku atau app
    // kembali dari background, UI bisa menampilkan lagu lama. Saat app kembali
    // aktif, baca ulang keadaan native (track, indeks, status, posisi) lewat
    // syncFromNative yang sudah ada — murah (hanya saat transisi foreground,
    // bukan polling).
    if (!(globalThis as any).__appStateSyncListener) {
      const { AppState } = require("react-native");
      const subscription = AppState.addEventListener(
        "change",
        (state: string) => {
          if (state === "active") {
            void get().syncFromNative();
          }
        },
      );
      (globalThis as any).__appStateSyncListener = subscription;
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

    // FIX B1 (2026-11-10): tulis audioSessionId ke store saat startup.
    //
    // Sebelumnya tidak ada yang pernah menulis field ini (setter ada tapi
    // nol pemanggil): satu-satunya penulis session ID,
    // useAudioPlayer.syncAudioSession, menulis ke EQUALIZER store — dan itu
    // pun hanya jalan 800 ms setelah play dari Search. Akibatnya
    // visualizer.tsx + SpectrumAnalyzer selalu membaca null dan service
    // tidak pernah di-start.
    //
    // ID-nya sudah dibuat di audioEngine.initialize() (jalan sebelum
    // initStore di _layout performInitialization), jadi di sini tinggal
    // diambil lewat getter — tanpa membuat session baru dan tanpa menyentuh
    // jalur FX equalizer.
    const bootSessionId = audioEngine.getSessionId();
    if (bootSessionId && bootSessionId > 0) {
      get().setAudioSessionId(bootSessionId);
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
      // Batalkan dulu timer lama untuk id ini (bila ada) supaya timer basi
      // tidak menghapus entri in-flight panggilan baru untuk lagu yang sama.
      clearTimeout(_playInFlightTimers.get(song.id));
      _playInFlightTimers.set(
        song.id,
        setTimeout(() => {
          _playInFlightSongIds.delete(song.id);
          _playInFlightTimers.delete(song.id);
        }, 20_000),
      );
    }

    // B17-P-a: semua jalur setelah add() — termasuk early return di
    // bawah dan throw dari recoverUri — harus melewati finally supaya
    // id dilepas. Kalau tidak, tap lagu yang sedang pause dalam 20 detik
    // diabaikan diam-diam oleh gate Layer 1. Timeout 20 detik di atas
    // tetap dipertahankan sebagai backstop kedua.
    try {
      const state = get();
      if (state.currentSong?.id === song.id && state.isPlaying) {
        console.log("[PERF] playSong: already playing same track, skip");
        return true;
      }

      let playableSong: Song = song.uri ? { ...song } : await recoverUri(song);

      console.log(`▶️ [Player] playSong: "${playableSong.title}"`);

      // B17-P-b (2026-11-15): rotasi DIHAPUS — antrean dikirim ASLI (urutan
      // file/library) + tapIndex sebagai startIndex ke native. Dulu queue
      // di-rotate supaya lagu yang di-tap selalu index 0 karena native
      // selalu reset ke 0; sekarang TrackQueue::setTracks(startIndex)
      // yang menaruh lagu yang di-tap di posisi aktif. LAST_QUEUE_IDS
      // di bawah otomatis tersimpan dalam urutan ASLI, dan restore
      // (initStore) + resume path mengandalkan itu.
      const targetQueue = newQueue ?? state.queue;
      if (targetQueue.length === 0) {
        set({ playError: "Queue is empty" });
        return false;
      }

      try {
        // ── 1. Filter URIs ─────────────────────────────────
        const tFilter0 = Date.now();
        const targetQueueSafe = targetQueue.filter((s) => !!s.uri);
        const uris = targetQueueSafe.map((s) => s.uri);
        // Laju file dipasangkan dengan uris yang SAMA (setelah filter), supaya
        // track tanpa laju tidak menggeser laju track lain.
        const queueRates = targetQueueSafe.map((s) => s.sampleRate ?? 0);
        // B17-headless: metadata dipasangkan dengan uris yang SAMA (setelah
        // filter) — native menyimpannya di TrackInfo supaya notifikasi /
        // lock screen benar saat Next headless (JS mati). Durasi Song
        // dalam detik → ms untuk native (TrackInfo.durationMs).
        const queueTitles = targetQueueSafe.map((s) => s.title ?? "");
        const queueArtists = targetQueueSafe.map((s) => s.artist ?? "");
        const queueAlbums = targetQueueSafe.map((s) => s.album ?? "");
        const queueArtworks = targetQueueSafe.map((s) => s.artwork ?? "");
        const queueDurationsMs = targetQueueSafe.map(
          (s) => Math.round((s.duration ?? 0) * 1000),
        );
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
        // B17-P-b: tapIndex dihitung dari antrean YANG SUDAH DIFILTER
        // (sama dengan uris/rates yang dikirim), supaya lagu tanpa URI
        // yang terbuang filter tidak menggeser indeks.
        const tapIndex = Math.max(
          0,
          targetQueueSafe.findIndex((s) => s.id === playableSong.id),
        );
        await timedCall("setQueue", () =>
          NativePlaybackService.setQueue(
            uris,
            queueRates,
            tapIndex,
            queueTitles,
            queueArtists,
            queueAlbums,
            queueArtworks,
            queueDurationsMs,
          ),
        );

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
          state.currentSong?.id === playableSong.id && state.position > 0;

        const resumePosition = isResumeAfterRestart ? state.position : 0;

        set({
          currentSong: playableSong,
          queue: targetQueue,
          isPlaying: true,
          position: resumePosition,
          playError: null,
          // L1: lirik dari DB bila ada (synced diutamakan, lalu polos);
          // kosong → FullLyricsView menampilkan "Instrumental or No
          // Lyrics Found" sampai lazy-load di bawah menemukan .lrc.
          lyrics: songLyricsToLines(playableSong),
        });

        // L1: bila DB belum punya lirik, coba .lrc berdampingan (lazy
        // backfill untuk library lama) — jangan blokir playback; hanya
        // terapkan bila lagu ini masih yang sedang diputar.
        safeFireAndForget(async () => {
          const loaded = await loadLyricsForSong(playableSong);
          if (loaded && get().currentSong?.id === playableSong.id) {
            get().setLyrics(loaded.lines);
          }
        }, "loadLyrics");

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
          }, 500); // delay 500ms biar decoder siap
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
              get().repeat === "off" ? 0 : get().repeat === "all" ? 2 : 1,
            ),
          "updateRepeatMode(init)",
        );

        AsyncStorage.setItem(KEYS.LAST_SONG_ID, playableSong.id).catch(
          () => {},
        );
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
    } finally {
      // C4.2 (Batch 18): batalkan timer backstop 20 dtk panggilan ini,
      // supaya timer lama tidak menghapus id in-flight panggilan baru
      // (tap ulang lagu sama < 20 dtk). clearTimeout(undefined) aman.
      clearTimeout(_playInFlightTimers.get(song.id));
      _playInFlightTimers.delete(song.id);
      _playInFlightSongIds.delete(song.id);
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
      await get().handleTrackChanged("skip-to-index");
    } catch (e) {
      console.error(`[Player] skipToIndex(${valid}) gagal:`, e);
      set({ playError: "Tidak bisa pindah lagu." });
    }
  },

  // J1-3 fix 2 (Batch JS-1): satu corong untuk SEMUA jalur pergantian
  // trek — in-app next/prev/skip, event native onPlaybackTrackChanged
  // (MediaSession), dan onPlaybackTrackEnded (auto-advance). Sebelumnya
  // tiap jalur memanggil syncFromNative langsung (atau tidak sama sekali —
  // silent-next: native next() in-app TIDAK meng-emit track-changed,
  // hanya onSkipToNext MediaSession dan auto-advance yang emit; lihat
  // NativePlaybackModule.next() vs MediaSessionManager.onSkipToNext).
  // Sekarang semua jalur navigasi memanggil fungsi ini, jadi tidak ada
  // lagi jalur yang diam.
  //
  // Cegah emit/sync ganda: native TIDAK meng-emit untuk next/prev in-app
  // (verifikasi di Kotlin), jadi jalur in-app tidak bisa double dengan
  // event native. Satu-satunya double yang nyata adalah auto-advance —
  // native meng-emit trackEnded DAN trackChanged untuk advance yang sama —
  // dan itu di-coalesce di sini: kalau sync sedang berjalan, pemicu kedua
  // hanya menandai pending dan dijalankan sekali setelahnya. syncFromNative
  // sendiri idempotent (playCount dijaga guard pergantian id), jadi
  // kalaupun dua sync tetap terjadi berurutan, tidak ada efek ganda.
  handleTrackChanged: async (source: string) => {
    if (_trackChangedSyncInFlight) {
      _trackChangedSyncPending = source;
      return;
    }
    _trackChangedSyncInFlight = true;
    try {
      await get().syncFromNative();
    } finally {
      _trackChangedSyncInFlight = false;
      if (_trackChangedSyncPending) {
        const pending = _trackChangedSyncPending;
        _trackChangedSyncPending = null;
        await get().handleTrackChanged(pending);
      }
    }
  },

  // Baca ulang keadaan sebenarnya dari native (track aktif, indeks, status).
  // Dipanggil setelah setiap perintah navigasi supaya UI menampilkan apa yang
  // benar-benar dimuat native - termasuk kalau yang mengubah adalah tombol
  // di notification / lock screen, yang tidak lewat store.
  syncFromNative: async () => {
    try {
      // Lagu sebelum sync — dipakai untuk mendeteksi pergantian trek
      // (lihat pencatatan playCount di bawah).
      const prevSong = get().currentSong;
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

      // Catat pemutaran saat trek berganti (auto-advance / next / prev dari
      // notifikasi / lock screen). Sebelumnya hanya playSong eksplisit yang
      // mencatat playCount + recent_plays + LAST_SONG_ID, jadi lagu yang
      // diputar lewat auto-advance tidak pernah tercatat (ronde 2/3 emulator).
      // Guard id berbeda mencegah hitung ganda dari sync berulang lagu sama.
      if (cur && prevSong && cur.id !== prevSong.id) {
        SongQueries.incrementPlayCount?.(cur.id, 0);
        AsyncStorage.setItem(KEYS.LAST_SONG_ID, cur.id).catch(() => {});
      }
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
      await get().handleTrackChanged("in-app-next");
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
      await get().handleTrackChanged("in-app-previous");
    } catch (e) {
      console.error("[Player] playPrevious gagal:", e);
    }
  },

  setIsPlaying: async (isPlaying: boolean) => {
    try {
      if (isPlaying) {
        // 🔥 FIX: setelah app restart, native queue KOSONG (restore dilakukan
        // lazy — lihat initStore baris ~199). Kalau user tap play sebelum
        // memutar trek apapun, native menolak: "queue_->current() null".
        //
        // Sebelumnya: play() gagal 212ms, UI reset ke isPlaying=false, user
        // harus tap dua kali. Sekarang: kalau native queue kosong tapi JS punya
        // currentSong, lakukan re-sync seperti playSong() — setQueue (URI
        // mentah langsung ke native; fd+AVIO, tanpa copy — opsi B
        // 2026-11-13) baru play.
        try {
          const nativeSize = NativePlaybackService.getQueueSize();
          if (nativeSize === 0) {
            const s = get();
            const song = s.currentSong;
            if (song?.uri) {
              console.log(
                "[Player] 🔁 Native queue kosong — re-sync sebelum play()",
              );
              const target = s.queue.length > 0 ? s.queue : [song];
              const targetSafe = target.filter((x) => !!x.uri);
              const uris = targetSafe.map((x) => x.uri);
              const rates = targetSafe.map((x) => x.sampleRate ?? 0);
              // B17-headless: metadata dipasangkan dengan uris yang SAMA
              // (setelah filter) — lihat playSong di atas.
              const titles = targetSafe.map((x) => x.title ?? "");
              const artists = targetSafe.map((x) => x.artist ?? "");
              const albums = targetSafe.map((x) => x.album ?? "");
              const artworks = targetSafe.map((x) => x.artwork ?? "");
              const durationsMs = targetSafe.map((x) =>
                Math.round((x.duration ?? 0) * 1000),
              );
              if (uris.length > 0) {
                // B17-P-b: resume TANPA rotasi — `target` sudah urutan
                // ASLI (LAST_QUEUE_IDS tersimpan asli sejak rotasi
                // dihapus; initStore me-restore apa adanya), jadi
                // startIndex = posisi lagu yang di-resume di antrean
                // yang sudah difilter. Tidak ketemu → 0 (fallback
                // aman; terjadi kalau queue = [song] saja).
                const resumeIndex = Math.max(
                  0,
                  targetSafe.findIndex((x) => x.id === song.id),
                );
                await timedCall("setQueue(resume)", () =>
                  NativePlaybackService.setQueue(
                    uris,
                    rates,
                    resumeIndex,
                    titles,
                    artists,
                    albums,
                    artworks,
                    durationsMs,
                  ),
                );
                if (s.position > 0) {
                  // posisi restore: biarkan decoder siap dulu, baru seek
                  setTimeout(async () => {
                    try {
                      await NativePlaybackService.seek(s.position * 1000);
                      console.log(
                        `[Player] ✅ resume seek ke ${s.position}s setelah re-sync`,
                      );
                    } catch (e) {
                      console.warn("[Player] resume seek gagal:", e);
                    }
                  }, 500);
                }
              }
            }
          }
        } catch (probeErr) {
          // getQueueSize sync bisa melempar kalau bridge belum siap — bukan
          // fatal, lanjut ke play() biasa.
          console.warn("[Player] probe queue size gagal:", probeErr);
        }

        // 🔥 FIX (2026-11-10, P-M9): terapkan kecepatan tersimpan ke native
        // sebelum play. initStore hanya me-restore speed ke Zustand; native
        // default 1.0 setelah app restart. Tanpa ini, speed 1.5x dari sesi
        // lalu tidak berlaku sampai user mengubahnya lagi di UI. Idempotent
        // (native mengabaikan laju yang sama) dan dibungkus try/catch supaya
        // kegagalan rate tidak menggagalkan play.
        try {
          const speed = get().playbackSpeed;
          if (speed && speed !== 1.0) {
            await audioEngine.setPlaybackRate(speed);
          }
        } catch (rateErr) {
          console.warn("[Player] terapkan playbackSpeed gagal:", rateErr);
        }

        // 🔥 FASE R (2026-11-11): terapkan tuning tersimpan ke native
        // sebelum play (pola yang sama dengan speed di atas).
        try {
          const cents = get().tuningCents;
          if (cents && cents !== 0) {
            await audioEngine.setPitchRatio(Math.pow(2, cents / 1200));
          }
        } catch (tuneErr) {
          console.warn("[Player] terapkan tuningCents gagal:", tuneErr);
        }

        // Intensitas master Solfeggio tersimpan — terapkan sebelum play,
        // pola yang sama dengan tuning di atas (native default 0.5
        // setelah app restart).
        try {
          const intensity = get().resonanceIntensity;
          if (intensity !== 0.5) {
            NativeDSPModule?.setResonanceIntensity?.(intensity);
          }
        } catch (intensityErr) {
          console.warn(
            "[Player] terapkan resonanceIntensity gagal:",
            intensityErr,
          );
        }

        // Frekuensi resonator Solfeggio tersimpan — terapkan sebelum play,
        // pola yang sama (native default 528 Hz setelah app restart).
        try {
          const freq = get().solfeggioFreq;
          if (freq !== DEFAULT_SOLFEGEGGIO_FREQ) {
            NativeDSPModule?.setSolfeggioFreq?.(freq);
          }
        } catch (freqErr) {
          console.warn("[Player] terapkan solfeggioFreq gagal:", freqErr);
        }

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
      // Posisi optimistis: tampilkan posisi target SEBELUM native seek
      // selesai. Sebelumnya posisi baru di-set sesudah `await`, jadi
      // slider snap-back ke posisi lama selama seek berjalan (seek pernah
      // terukur ~3 detik di device) — itulah "slider terlambat".
      // Kalau seek native gagal, watcher 500ms mengoreksi dari posisi
      // native; kalau seek mendarat di keyframe, watcher juga mengoreksi.
      set({ position: pos });
      await timedCall("seek", () => NativePlaybackService.seek(pos * 1000));

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
    // 🔥 FIX: kirim ke native (0=off, 1=track, 2=all — enum C++
    // PlaybackTypes.h: Off 0, One 1, All 2; sama dengan konstanta Android).
    // KOREKSI 2026-11-11 (J-M1): peta lama (1=all, 2=track) TERBALIK.
    const nativeMode = next === "off" ? 0 : next === "all" ? 2 : 1;
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
      set({ playbackSpeed: speed });
      await AsyncStorage.setItem(KEYS.SPEED, speed.toString());
      // 🔥 FIX (2026-11-10, P-M9): kecepatan sekarang benar-benar diteruskan
      // ke native (WSOLA time-stretch). Sebelumnya hanya disimpan — placebo.
      await audioEngine.setPlaybackRate(speed);
    } catch (error) {
      console.error("[Player] setPlaybackSpeed failed:", error);
    }
  },

  setTuningCents: async (cents: number) => {
    try {
      // ±100 sen = rasio 0.944–1.059 (jauh di dalam rentang native 0.5–2.0).
      const clamped = clampTuningCents(cents);
      set({ tuningCents: clamped });
      await AsyncStorage.setItem(KEYS.TUNING_CENTS, clamped.toString());
      // 🔥 FASE R (2026-11-11): retune — sen diubah ke rasio (2^(sen/1200))
      // dan diteruskan ke native (phase vocoder). 0 sen = A=440 standar;
      // -31.77 sen = A=432 (Verdi).
      await audioEngine.setPitchRatio(Math.pow(2, clamped / 1200));
    } catch (error) {
      console.error("[Player] setTuningCents failed:", error);
    }
  },

  // Intensitas master Solfeggio (0..1). Pola setBassBoost
  // (equalizerStore): jepit, simpan, dorong langsung ke native — live,
  // tanpa throttle/debounce.
  setResonanceIntensity: async (intensity: number) => {
    try {
      const clamped = Math.min(1, Math.max(0, intensity));
      set({ resonanceIntensity: clamped });
      await AsyncStorage.setItem(KEYS.RESONANCE_INTENSITY, clamped.toString());
      // Sync void — rantai JNI lengkap (NativeDSPModule.cpp →
      // EngineManager → AudioEngine → AudioState); default native 0.5.
      NativeDSPModule?.setResonanceIntensity?.(clamped);
      // Intensitas berubah -> template aktif bisa jadi "kustom".
      const templateId = activeSolfeggioTemplateId(
        get().solfeggioFreq,
        clamped,
      );
      set({ solfeggioTemplateId: templateId });
      await AsyncStorage.setItem(KEYS.SOLFEGGIO_TEMPLATE, templateId);
    } catch (error) {
      console.error("[Player] setResonanceIntensity failed:", error);
    }
  },

  // Frekuensi resonator Solfeggio (Hz). Pola setResonanceIntensity:
  // jepit 100–2000, simpan, dorong langsung ke native — live, tanpa
  // throttle/debounce. Template aktif ikut dihitung ulang (bisa "kustom").
  setSolfeggioFreq: async (freq: number) => {
    try {
      const clamped = clampSolfeggioFreq(freq);
      set({ solfeggioFreq: clamped });
      await AsyncStorage.setItem(KEYS.SOLFEGGIO_FREQ, clamped.toString());
      // Sync void — rantai JNI lengkap (NativeDSPModule.cpp →
      // EngineManager → AudioEngine → AudioState); default native 528 Hz.
      NativeDSPModule?.setSolfeggioFreq?.(clamped);
      const templateId = activeSolfeggioTemplateId(
        clamped,
        get().resonanceIntensity,
      );
      set({ solfeggioTemplateId: templateId });
      await AsyncStorage.setItem(KEYS.SOLFEGGIO_TEMPLATE, templateId);
    } catch (error) {
      console.error("[Player] setSolfeggioFreq failed:", error);
    }
  },

  // Pilih template Solfeggio: atur frekuensi + intensitas template, live
  // ke native (lewat setSolfeggioFreq / setResonanceIntensity), lalu
  // simpan id template-nya. Template hanya titik awal — mengubah slider
  // atau frekuensi sesudahnya membuat template aktif jadi "kustom".
  setSolfeggioTemplate: async (id: string) => {
    try {
      const template = getSolfeggioTemplate(id);
      if (!template) {
        console.warn("[Player] setSolfeggioTemplate: id tak dikenal:", id);
        return;
      }
      await get().setSolfeggioFreq(template.freq);
      await get().setResonanceIntensity(template.intensity);
      set({ solfeggioTemplateId: template.id });
      await AsyncStorage.setItem(KEYS.SOLFEGGIO_TEMPLATE, template.id);
    } catch (error) {
      console.error("[Player] setSolfeggioTemplate failed:", error);
    }
  },

  /**
   * Ganti mode pemrosesan.
   *
   * Dua jalur yang berbeda sifatnya — jangan samakan:
   *  - `setProcessingMode` (DSP <-> Immersive): LIVE, berlaku pada buffer
   *    berikutnya, tanpa restart stream.
   *  - `toggleExclusiveMode` (keluar/masuk bit-perfect): REOPEN stream
   *    (stop + start ulang) + reload track, jadi ada jeda — bukan live.
   *
   * Dua hal yang dikirim ke native, dan keduanya terpisah:
   *
   *  1. `setProcessingMode` - mode PEMROSESAN (bit-perfect/dsp/immersive).
   *     Dibaca per-buffer dari atomic, jadi efeknya pada frame berikutnya.
   *
   *  2. `toggleExclusiveMode` - hanya untuk bit-perfect. Ini syarat JALUR
   *     (bypass mixer), bukan pemrosesan. Gagal di sini TIDAK memblokir audio:
   *     stream tetap jalan lewat shared mode dan statusnya dilaporkan UI.
   *
   * Mode immersive/dsp tidak menyentuh exclusive - membiarkannya menyala saat
   * pindah dari bit-perfect akan salah, dan mematikan paksa akan membuang
   * pilihan user tanpa alasan.
   */
  setAudioMode: async (mode: AudioMode) => {
    const previous = get().audioMode;

    set({ audioMode: mode });
    await AsyncStorage.setItem(KEYS.MODE, mode);

    // Pemrosesan: berlaku untuk ketiga mode.
    audioEngine.setProcessingMode(mode);

    // Jalur: hanya relevan untuk bit-perfect.
    //
    // Menyalakan exclusive saat MASUK bit-perfect, dan mematikannya saat
    // KELUAR - membiarkannya menyala saat pindah ke DSP/Immersive akan
    // membuang kesempatan memakai mixer (yang justru aman untuk DSP), dan
    // membiarkannya mati tidak apa-apa. Tapi kalau sebelumnya bukan
    // bit-perfect, tidak ada yang perlu dimatikan.
    if (mode === "bit-perfect") {
      await audioEngine.toggleExclusiveMode(true);
    } else if (previous === "bit-perfect") {
      await audioEngine.toggleExclusiveMode(false);
    }
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
          codec: row.codec || undefined,
          sampleRate: Number(row.sampleRate) || undefined,
          bitDepth: Number(row.bitDepth) || undefined,
          bitrate: Number(row.bitrate) || undefined,
          isHiRes: isHiRes(row),
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