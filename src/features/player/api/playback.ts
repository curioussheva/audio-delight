// src/features/player/api/playback.ts

import TrackPlayer, { Event, State } from "react-native-track-player";
import { NativeModules } from "react-native";
import { useEqualizerStore } from "@/features/equalizer/store/equalizerStore";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { visualizerService } from "@/features/visualizer/services/VisualizerService";

const { NativeDSPModule } = NativeModules;

// Lazy Platform access untuk avoid PlatformConstants crash saat bootstrap
const getPlatformOS = () => {
  try {
    const { Platform } = require("react-native");
    return Platform.OS;
  } catch { return "android"; }
};

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const DSP_INIT_DELAY_MS = 600;
const SESSION_ID_MAX_RETRIES = 3;
const SESSION_ID_RETRY_DELAY_MS = 300;

// ─────────────────────────────────────────────
// Audio Session ID
// ─────────────────────────────────────────────

const getAudioSessionId = async (): Promise<number | null> => {
  if (getPlatformOS() !== "android") return null;

  for (let attempt = 1; attempt <= SESSION_ID_MAX_RETRIES; attempt++) {
    try {
      if (typeof NativeDSPModule?.getActiveAudioSessionId === "function") {
        const id = await NativeDSPModule.getActiveAudioSessionId();
        if (id && id > 0) {
          console.log(`[DSP] Got session ID from AudioManager: ${id}`);
          return id;
        }
      }
    } catch (error) {
      console.warn(`[DSP] getAudioSessionId attempt ${attempt} failed:`, error);
    }

    if (attempt < SESSION_ID_MAX_RETRIES) {
      await sleep(SESSION_ID_RETRY_DELAY_MS);
    }
  }

  console.warn("[DSP] Could not obtain audio session ID after retries");
  return null;
};

// ─────────────────────────────────────────────
// DSP Effects
// ─────────────────────────────────────────────

const applyAllEffects = async (sessionId: number): Promise<void> => {
  if (!NativeDSPModule) return;

  // FIX 1: setAudioSessionId SELALU dipanggil, tidak tergantung EQ enabled
  // Visualizer butuh session ID meski EQ mati
  usePlayerStore.getState().setAudioSessionId(sessionId);

  const eq = useEqualizerStore.getState();

  if (!eq.isEQEnabled) {
    console.log("[DSP] EQ disabled, session ID set but skipping effects");
    return;
  }

  console.log(`[DSP] Applying effects → session ${sessionId}`);

  const errors: string[] = [];

  // 1. EQ Bands
  if (eq.bands?.length > 0) {
    try {
      // FIX 2: Kirim dB mentah (-12..+12), Kotlin yang konversi ke millibels (* 100)
      // JANGAN konversi di sini — NativeDSPModule.kt sudah handle konversi
      const gains = eq.bands.map((b) => Math.min(12, Math.max(-12, b.gain)));

      if (NativeDSPModule.setFullEqualizer) {
        await NativeDSPModule.setFullEqualizer(gains, sessionId);
      } else if (NativeDSPModule.setBandLevel) {
        for (let i = 0; i < gains.length; i++) {
          // setBandLevel di Kotlin tidak konversi — kirim millibels manual
          const millibels = Math.round(gains[i] * 100);
          await NativeDSPModule.setBandLevel(i, millibels, sessionId);
        }
      }
    } catch (e) {
      errors.push(`Equalizer: ${e}`);
    }
  }

  // 2. Bass Boost
  if ((eq.bassStrength ?? 0) > 0) {
    try {
      await NativeDSPModule.setBassBoost(eq.bassStrength, sessionId);
    } catch (e) {
      errors.push(`BassBoost: ${e}`);
    }
  }

  // 3. Virtualizer
  if ((eq.virtualizerLevel ?? 0) > 0 && NativeDSPModule.setVirtualizer) {
    try {
      await NativeDSPModule.setVirtualizer(eq.virtualizerLevel, sessionId);
    } catch (e) {
      errors.push(`Virtualizer: ${e}`);
    }
  }

  // 4. Reverb
  if ((eq.reverbPreset ?? 0) > 0) {
    try {
      await NativeDSPModule.setReverbPreset(eq.reverbPreset, sessionId);
    } catch (e) {
      errors.push(`Reverb: ${e}`);
    }
  }

  if (errors.length > 0) {
    console.warn(`[DSP] Partial failure: ${errors.join(" | ")}`);
  } else {
    console.log(`[DSP] ✅ All effects applied → session ${sessionId}`);
  }
};

const releaseAllEffects = async (): Promise<void> => {
  if (!NativeDSPModule) return;
  try {
    await NativeDSPModule.releaseAllFX?.();
    await NativeDSPModule.reset?.();
    console.log("[DSP] All effects released");
  } catch (error) {
    console.error("[DSP] Failed to release effects:", error);
  }
};

// ─────────────────────────────────────────────
// DSP + Visualizer Session Init
// ─────────────────────────────────────────────

let lastDspTrackIndex: number | null = null;

const initDspForTrack = async (
  trackIndex: number | undefined,
): Promise<void> => {
  if (trackIndex === undefined || trackIndex === lastDspTrackIndex) return;
  lastDspTrackIndex = trackIndex;

  const sessionId = await getAudioSessionId();
  if (!sessionId) return;

  console.log(`[DSP] Session ID: ${sessionId} (track index: ${trackIndex})`);

  // FIX 3: Start visualizer dengan session ID yang sama, paralel dengan DSP
  await Promise.all([
    applyAllEffects(sessionId),
    visualizerService
      .start(sessionId)
      .catch((e) => console.warn("[Visualizer] Start failed:", e)),
  ]);
};

// ─────────────────────────────────────────────
// PlaybackService
// ─────────────────────────────────────────────

export const playbackService = async function () {
  console.log("[PlaybackService] Initializing...");

  let pendingTrackIndex: number | undefined;

  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, (event) => {
    console.log("[PlaybackService] Active track changed", event.index);
    pendingTrackIndex = event.index;

    if (event.track) {
      const { queue } = usePlayerStore.getState();
      const song = queue.find((s) => String(s.id) === String(event.track?.id));
      if (song) usePlayerStore.getState().setCurrentSong(song);
    }
  });

  TrackPlayer.addEventListener(Event.PlaybackState, async (event) => {
    const stateLabel = stateToString(event.state);
    console.log(`[PlaybackService] Playback state: ${stateLabel}`);

    const player = usePlayerStore.getState();

    switch (event.state) {
      case State.Playing:
        player.setIsPlaying(true);
        if (getPlatformOS() === "android") {
          setTimeout(() => {
            initDspForTrack(pendingTrackIndex).catch((err) =>
              console.error("[DSP] Init Error:", err),
            );
          }, DSP_INIT_DELAY_MS);
        }
        break;

      case State.Paused:
        player.setIsPlaying(false);
        visualizerService.pause();
        break;

      case State.Stopped:
        player.setIsPlaying(false);
        visualizerService.stop();
        usePlayerStore.getState().setAudioSessionId(null);
        break;

      case State.Error:
        console.error("[PlaybackService] Playback error state");
        player.setIsPlaying(false);
        visualizerService.stop();
        break;

      default:
        break;
    }
  });

  // Remote controls
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteNext, () =>
    usePlayerStore.getState().playNext(),
  );
  TrackPlayer.addEventListener(Event.RemotePrevious, () =>
    usePlayerStore.getState().playPrevious(),
  );

  TrackPlayer.addEventListener(Event.RemoteSeek, async (event) => {
    await TrackPlayer.seekTo(event.position);
    usePlayerStore.getState().setPosition(event.position);
  });

  TrackPlayer.addEventListener(Event.RemoteStop, async () => {
    console.log("[Remote] Stop");
    try {
      await TrackPlayer.reset();
      await releaseAllEffects();
      visualizerService.stop();
      usePlayerStore.getState().setIsPlaying(false);
      usePlayerStore.getState().setAudioSessionId(null);
    } catch (error) {
      console.error("[Remote] Stop error:", error);
    }
  });

  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, async () => {
    console.log("[PlaybackService] Queue ended");
    const { repeat, playNext } = usePlayerStore.getState();
    if (repeat === "all") await playNext();
    else {
      usePlayerStore.getState().setIsPlaying(false);
      visualizerService.stop();
    }
  });

  TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, (event) => {
    const { setPosition, setDuration } = usePlayerStore.getState();
    setPosition(event.position);
    if (event.duration > 0) setDuration(event.duration);
  });

  console.log("[PlaybackService] Registered with Full DSP + Visualizer Sync");
};

// ─────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────

export const dspHelpers = {
  applyAllEffects,
  releaseAllEffects,
  getAudioSessionId,
};

// ─────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const stateToString = (state: number): string => {
  switch (state) {
    case State.Playing:
      return "playing";
    case State.Paused:
      return "paused";
    case State.Stopped:
      return "stopped";
    case State.Buffering:
      return "buffering";
    case State.Loading:
      return "loading";
    case State.Ready:
      return "ready";
    case State.Error:
      return "error";
    case State.None:
      return "none";
    default:
      return `unknown (${state})`;
  }
};
