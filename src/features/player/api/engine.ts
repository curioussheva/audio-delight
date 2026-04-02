import TrackPlayer, {
  Capability,
  RepeatMode,
  State,
  AppKilledPlaybackBehavior,
} from "react-native-track-player";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { Song } from "@/shared/types/audio";
import { requestAudioPermissions } from "@/shared/utils/permissions";
import USBDACService from "@/features/hardware/api/usb";
import NativeDSPModule from "@/features/visualizer/native/DSPModule";
import {
  startVisualizer,
  stopVisualizer,
} from "@/features/visualizer/native/VisualizerBridge";

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
        minBuffer: 100,
        maxBuffer: 300,
        playBuffer: 2,
        backBuffer: 60,
        waitForBuffer: true,
      });

      await TrackPlayer.updateOptions({
        android: {
          appKilledPlaybackBehavior:
            AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
          alwaysPauseOnInterruption: true,
          notificationCapabilities: [
            Capability.Play,
            Capability.Pause,
            Capability.SkipToNext,
            Capability.SkipToPrevious,
            Capability.SeekTo,
          ],
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
      console.log("💎 [AudioEngine] High-Res Engine Ready");
    } catch (error) {
      console.error("❌ [AudioEngine] Setup Failed:", error);
      throw error;
    }
  }

  // ─── DSP Logic ───────────────────────────────────────

  public async applyDSP(sessionId: number): Promise<void> {
    const mode = await AsyncStorage.getItem("audio_mode_preference");
    if (mode === "dsp" && NativeDSPModule) {
      try {
        const bassStrength =
          (await AsyncStorage.getItem("dsp_bass_strength")) || "500";
        await (NativeDSPModule as any).setBassBoost(
          parseInt(bassStrength),
          sessionId,
        );
        console.log(`💎 [AudioEngine] DSP Applied to Session ${sessionId}`);
      } catch (e) {
        console.warn("[AudioEngine] Failed to apply DSP effects", e);
      }
    }
  }

  private async refreshSessionId(): Promise<number | null> {
    try {
      const id = await (TrackPlayer as any).getAudioSessionId?.();
      if (typeof id === "number" && id > 0) {
        this.sessionId = id;
        return id;
      }
      return null;
    } catch (err) {
      return null;
    }
  }

  // ─── Playback Controls ────────────────────────────────

  async play(): Promise<void> {
    if (!this.isInitialized) await this.initialize();

    await TrackPlayer.play();

    // Sync DSP & Visualizer setelah play
    setTimeout(async () => {
      const sessionId = await this.refreshSessionId();
      if (!sessionId) return;

      const mode = await AsyncStorage.getItem("audio_mode_preference");

      if (mode !== "bit-perfect") {
        // Jalankan Efek Suara
        await this.applyDSP(sessionId);

        // Jalankan Visualizer
        if (!this.isVisualizerRunning) {
          const hasPermission = await requestAudioPermissions();
          if (hasPermission) {
            startVisualizer(sessionId);
            this.isVisualizerRunning = true;
          }
        }
      }
    }, 300);
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

  // ─── Queue & Others ───────────────────────────────────

  async setQueue(songs: Song[], startIndex = 0): Promise<void> {
    if (!this.isInitialized) await this.initialize();
    if (songs.length === 0) return;

    await TrackPlayer.reset();

    const tracks = songs.map((song) => ({
      id: song.id,
      url: song.uri,
      title: song.title,
      artist: song.artist,
      album: song.album || "",
      duration: song.duration,
      artwork: song.artwork,
    }));

    await TrackPlayer.add(tracks);
    if (startIndex >= 0 && startIndex < songs.length) {
      await TrackPlayer.skip(startIndex);
    }
  }

  async seekTo(positionSeconds: number): Promise<void> {
    await TrackPlayer.seekTo(positionSeconds);
  }

  async setRepeatMode(mode: RepeatModeType): Promise<void> {
    const repeat =
      mode === "track"
        ? RepeatMode.Track
        : mode === "all"
          ? RepeatMode.Queue
          : RepeatMode.Off;
    await TrackPlayer.setRepeatMode(repeat);
  }

  async setVirtualizer(strength: number): Promise<void> {
    const sessionId = await this.refreshSessionId();
    if (sessionId && NativeDSPModule) {
      await (NativeDSPModule as any).setVirtualizer(strength, sessionId);
    }
  }

  async getPlaybackState() {
    return await TrackPlayer.getState();
  }

  async destroy(): Promise<void> {
    stopVisualizer();
    if (NativeDSPModule) await (NativeDSPModule as any).releaseAllFX?.();
    await TrackPlayer.reset();
    this.isInitialized = false;
  }
}

export const audioEngine = new AudioEngine();
