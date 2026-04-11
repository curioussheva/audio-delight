// src/features/player/api/playback.ts

import TrackPlayer, { Event, State } from "react-native-track-player";

import { NativeDSPModule } from "@/features/equalizer/api/nativeInterface";
// (sesuaikan path ke file interface di atas)
import { Platform } from "react-native";
import { useEqualizerStore } from "@/features/equalizer/store/equalizerStore";
import { usePlayerStore } from "@/features/player/store/playerStore";


// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

/** How long to wait after track change before requesting audio session ID.
 *  Android audio focus handoff typically takes 200–400 ms. */
const DSP_INIT_DELAY_MS = 600;

/** How many times to retry getAudioSessionId before giving up. */
const SESSION_ID_MAX_RETRIES = 3;
const SESSION_ID_RETRY_DELAY_MS = 300;

// ─────────────────────────────────────────────
// Audio Session ID
// ─────────────────────────────────────────────

/**
 * Try to obtain the Android audio session ID.
 * Retries up to SESSION_ID_MAX_RETRIES times with a short delay between attempts,
 * because the session may not be ready immediately after a track change.
 */
 
const getAudioSessionId = async (): Promise<number | null> => {
  if (Platform.OS !== "android") return null;

  for (let attempt = 1; attempt <= SESSION_ID_MAX_RETRIES; attempt++) {
    try {
      // Tanya AudioManager langsung — paling reliable
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
  if (!NativeDSPModule) {
    console.warn("[DSP] NativeDSPModule not available");
    return;
  }

  const eq = useEqualizerStore.getState();

  if (!eq.isEQEnabled) {
    console.log("[DSP] EQ disabled, skipping effects");
    return;
  }

  console.log(`[DSP] Applying effects → session ${sessionId}`);
  const errors: string[] = [];

  // 1. Bass Boost
  if ((eq.bassStrength ?? 0) > 0) {
    try {
      await NativeDSPModule.setBassBoost(eq.bassStrength, sessionId);
    } catch (e) {
      errors.push(`BassBoost: ${e}`);
    }
  }

  // 2. Virtualizer
  if ((eq.virtualizerLevel ?? 0) > 0 && NativeDSPModule.setVirtualizer) {
    try {
      await NativeDSPModule.setVirtualizer(eq.virtualizerLevel, sessionId);
    } catch (e) {
      errors.push(`Virtualizer: ${e}`);
    }
  }

  // 3. Reverb
  if ((eq.reverbPreset ?? 0) > 0) {
    try {
      await NativeDSPModule.setReverbPreset(eq.reverbPreset, sessionId);
    } catch (e) {
      errors.push(`Reverb: ${e}`);
    }
  }

  // 4. EQ Bands
  if (eq.bands?.length > 0) {
    try {
      // Clamp to ±12 dB, scale to native integer (millibels ×100)
      const gains = eq.bands.map((b) =>
        Math.round(Math.min(12, Math.max(-12, b.gain)) * 100),
      );

      if (NativeDSPModule.setFullEqualizer) {
        await NativeDSPModule.setFullEqualizer(gains, sessionId);
      } else if (NativeDSPModule.setBandLevel) {
        for (let i = 0; i < gains.length; i++) {
          await NativeDSPModule.setBandLevel(i, gains[i], sessionId);
        }
      }
    } catch (e) {
      errors.push(`Equalizer: ${e}`);
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
// DSP Session Init (called once per track, on State.Playing)
// ─────────────────────────────────────────────

/** Guard to prevent double-applying DSP within the same track play event. */
let lastDspTrackIndex: number | null = null;

const initDspForTrack = async (trackIndex: number | undefined): Promise<void> => {
  if (trackIndex === undefined || trackIndex === lastDspTrackIndex) return;
  lastDspTrackIndex = trackIndex;

  const sessionId = await getAudioSessionId();
  if (!sessionId) return;

  console.log(`[DSP] Session ID: ${sessionId} (track index: ${trackIndex})`);
  await applyAllEffects(sessionId);
};

// ─────────────────────────────────────────────
// PlaybackService
// ─────────────────────────────────────────────

export const playbackService = async function () {
  console.log("[PlaybackService] Initializing...");

  // ── Track changed ──────────────────────────────────────────────────────────
  // Store the incoming track index so PlaybackState.Playing can use it.
  let pendingTrackIndex: number | undefined;

  TrackPlayer.addEventListener(
    Event.PlaybackActiveTrackChanged,
    (event) => {
      console.log("[PlaybackService] Active track changed", event.index);
      pendingTrackIndex = event.index;

      // Sync currentSong in PlayerStore
      if (event.track) {
        const { queue } = usePlayerStore.getState();
        const song = queue.find((s) => String(s.id) === String(event.track?.id));
        if (song) usePlayerStore.getState().setCurrentSong(song);
      }
    },
  );

  // ── Playback state ─────────────────────────────────────────────────────────
  TrackPlayer.addEventListener(Event.PlaybackState, async (event) => {
    const stateLabel = stateToString(event.state);
    console.log(`[PlaybackService] Playback state: ${stateLabel}`);

    const player = usePlayerStore.getState();

    switch (event.state) {
      case State.Playing: // ✅
        player.setIsPlaying(true);
        if (Platform.OS === "android") {
          setTimeout(() => initDspForTrack(pendingTrackIndex), DSP_INIT_DELAY_MS);
        }
        break;

      case State.Paused:  // ✅
      case State.Stopped: // ✅
        player.setIsPlaying(false);
        break;

      case State.Error:   // ✅
        console.error("[PlaybackService] Playback error state");
        player.setIsPlaying(false);
        break;

      default:
        break;
    }
  });

  // ── Remote controls ────────────────────────────────────────────────────────
  TrackPlayer.addEventListener(Event.RemotePlay, () => {
    TrackPlayer.play();
  });

  TrackPlayer.addEventListener(Event.RemotePause, () => {
    TrackPlayer.pause();
  });

  TrackPlayer.addEventListener(Event.RemoteNext, () => {
    // Route through PlayerStore so shuffle/repeat logic is respected
    usePlayerStore.getState().playNext();
  });

  TrackPlayer.addEventListener(Event.RemotePrevious, () => {
    usePlayerStore.getState().playPrevious();
  });

  TrackPlayer.addEventListener(Event.RemoteSeek, async (event) => {
    await TrackPlayer.seekTo(event.position);
    usePlayerStore.getState().setPosition(event.position);
  });

  TrackPlayer.addEventListener(Event.RemoteStop, async () => {
    console.log("[Remote] Stop");
    try {
      await TrackPlayer.reset();
      await releaseAllEffects();
      usePlayerStore.getState().setIsPlaying(false);
    } catch (error) {
      console.error("[Remote] Stop error:", error);
    }
  });

  // ── Queue ended ────────────────────────────────────────────────────────────
  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, async () => {
    console.log("[PlaybackService] Queue ended");
    const { repeat, playNext } = usePlayerStore.getState();
    if (repeat === "all") {
      await playNext();
    } else {
      usePlayerStore.getState().setIsPlaying(false);
    }
  });

  // ── Progress sync ──────────────────────────────────────────────────────────
  // Sync position/duration from TrackPlayer to store at ~1 Hz
  TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, (event) => {
    const { setPosition, setDuration } = usePlayerStore.getState();
    setPosition(event.position);
    if (event.duration > 0) setDuration(event.duration);
  });

  console.log("[PlaybackService] Registered with Full DSP Sync");
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
    case State.Playing:   // ✅
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
 