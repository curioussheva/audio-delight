import TrackPlayer, {
  Capability,
  RepeatMode,
  State,
} from "react-native-track-player";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { Song } from "@/types/audio";
import { requestAudioPermissions } from "@/utils/permissions";
import USBDACService from "@/services/hardware/USBDACService";
import NativeDSPModule from "../native/NativeDSPModule";
import { startVisualizer, stopVisualizer } from "../native/VisualizerBridge";

// ────────────────────────────────────────────────
//  Types & Interfaces
// ────────────────────────────────────────────────

interface AudioEngineConfig {
  minBufferMs?: number;
  maxBufferMs?: number;
  playBufferMs?: number;
}

const DEFAULT_CONFIG: Required<AudioEngineConfig> = {
  minBufferMs: 60,
  maxBufferMs: 120,
  playBufferMs: 1,
};

type RepeatModeType = "off" | "all" | "track";

// ────────────────────────────────────────────────
//  AudioEngine
// ────────────────────────────────────────────────

export class AudioEngine {
  private isInitialized = false;
  private sessionId: number | null = null;
  private config: Required<AudioEngineConfig>;
  private isVisualizerRunning = false;

  constructor(config: AudioEngineConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ─── Lifecycle ───────────────────────────────────────

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await TrackPlayer.setupPlayer({
        minBuffer: this.config.minBufferMs,
        maxBuffer: this.config.maxBufferMs,
        playBuffer: this.config.playBufferMs,
        waitForBuffer: true,
        backBuffer: 30,
      });

      await TrackPlayer.updateOptions({
        android: {
          appKilledPlaybackBehavior: "stop-playback-and-remove-notification",
          alwaysPauseOnInterruption: true,
        },
        capabilities: [
          Capability.Play,
          Capability.Pause,
          Capability.SkipToNext,
          Capability.SkipToPrevious,
          Capability.Stop,
          Capability.SeekTo,
        ],
        compactCapabilities: [
          Capability.Play,
          Capability.Pause,
          Capability.SkipToNext,
        ],
      });

      await this.refreshSessionId();

      this.isInitialized = true;
      console.log("[AudioEngine] Initialized");
    } catch (error) {
      console.error("[AudioEngine] Initialization failed:", error);
      throw error;
    }
  }

  private async refreshSessionId(): Promise<number | null> {
    try {
      // react-native-track-player doesn't officially expose this → type hole expected
      const id = await (TrackPlayer as any).getAudioSessionId?.();
      if (typeof id === "number" && id > 0) {
        this.sessionId = id;
        console.log(`[AudioEngine] Audio session ID: ${id}`);
        return id;
      }
      return null;
    } catch (err) {
      console.warn("[AudioEngine] Could not retrieve audio session ID", err);
      return null;
    }
  }

  async destroy(): Promise<void> {
    try {
      stopVisualizer();

      if (NativeDSPModule) {
        await (NativeDSPModule as any).releaseAllFX?.();
      }

      await TrackPlayer.reset();
      this.isInitialized = false;
      this.sessionId = null;
      console.log("[AudioEngine] Destroyed");
    } catch (error) {
      console.error("[AudioEngine] Destroy failed:", error);
    }
  }

  // ─── Hardware / Exclusive Mode ────────────────────────

  async toggleExclusiveMode(enable: boolean): Promise<boolean> {
    if (!NativeDSPModule) return false;

    try {
      if (enable) {
        stopVisualizer();
        await (NativeDSPModule as any).releaseAllFX?.();
      } else if (!USBDACService.isExclusiveActive()) {
        const sid = await this.refreshSessionId();
        if (sid) await startVisualizer(sid);
      }

      return await (NativeDSPModule as any).toggleExclusiveMode(enable);
    } catch (err) {
      console.error("[AudioEngine] Failed to toggle exclusive mode:", err);
      return false;
    }
  }

  // ─── Queue ────────────────────────────────────────────

  async setQueue(songs: Song[], startIndex = 0): Promise<void> {
    if (!this.isInitialized) await this.initialize();
    if (songs.length === 0) return; // Prevent empty queue crash

    await TrackPlayer.reset();

    // Hapus anotasi tipe ': tracks' dan perbaiki kurung '()'
    const tracks = songs.map((song) => ({
      id: song.id,
      url: song.uri,
      title: song.title,
      artist: song.artist,
      album: song.album || "Pristine Audio",
      duration: song.duration,
      artwork: song.artwork,
      contentType: song.uri.toLowerCase().endsWith(".flac")
        ? "audio/flac"
        : "audio/mpeg",
      // Pastikan property ini sesuai dengan ekspektasi TrackPlayer versi terbaru
      sampleRate: song.sampleRate,
      bitDepth: song.bitDepth,
    }));

    await TrackPlayer.add(tracks);

    if (startIndex >= 0 && startIndex < songs.length) {
      await TrackPlayer.skip(startIndex);
    }
  }

  // ─── Playback Controls ────────────────────────────────

  async play(): Promise<void> {
    if (!this.isInitialized) await this.initialize();

    await TrackPlayer.play();

    // Beri sedikit delay agar SessionID benar-benar siap (Android quirk)
    setTimeout(async () => {
      const sessionId = await this.refreshSessionId();
      const mode = await AsyncStorage.getItem("audio_mode_preference");

      if (mode !== "bit-perfect" && sessionId && !this.isVisualizerRunning) {
        const hasPermission = await requestAudioPermissions();
        if (hasPermission) {
          startVisualizer(sessionId);
          this.isVisualizerRunning = true;
        }
      }
    }, 200);
  }

  async pause(): Promise<void> {
    await TrackPlayer.pause();
    stopVisualizer();
    this.isVisualizerRunning = false;
  }

  async stop(): Promise<void> {
    await TrackPlayer.stop();
    stopVisualizer();
    this.isVisualizerRunning = false;
  }

  async skipToNext(): Promise<void> {
    await TrackPlayer.skipToNext();
  }

  async skipToPrevious(): Promise<void> {
    await TrackPlayer.skipToPrevious();
  }

  async seekTo(positionMs: number): Promise<void> {
    await TrackPlayer.seekTo(positionMs / 1000); // RNTP expects seconds
  }

  async setPlaybackRate(rate: number): Promise<void> {
    await (TrackPlayer as any).setRate?.(rate);
  }

  async setRepeatMode(mode: RepeatModeType): Promise<void> {
    const repeat =
      mode === "track"
        ? RepeatMode.Track
        : mode === "all"
          ? RepeatMode.Queue
          : RepeatMode.Off;

    await (TrackPlayer as any).setRepeatMode?.(repeat);
  }

  async getPositionMs(): Promise<number> {
    try {
      const progress = await (TrackPlayer as any).getProgress?.();
      if (progress?.position !== undefined) {
        return Math.round(progress.position * 1000);
      }
      const pos = await (TrackPlayer as any).getPosition?.();
      return typeof pos === "number" ? Math.round(pos * 1000) : 0;
    } catch {
      return 0;
    }
  }

  async getPlaybackState() {
    return await TrackPlayer.getState();
  }

  async isPlaying(): Promise<boolean> {
    const state = await this.getPlaybackState();
    return state === State.Playing;
  }
}

// Singleton export (most common pattern for audio engines)
export const audioEngine = new AudioEngine();
