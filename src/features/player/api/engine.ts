import AsyncStorage from "@react-native-async-storage/async-storage";
import { Song } from "@/shared/types/audio";
import { requestAudioPermissions } from "@/shared/utils/permissions";
import NativeDSPModule from "@/features/equalizer/api/nativeInterface";
import {
  startVisualizer,
  stopVisualizer,
} from "@/features/visualizer/native/VisualizerBridge";
import NativePlaybackService from "@/specs/NativePlaybackService";

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

const REPEAT_MODE_MAP: Record<RepeatModeType, number> = {
  off: 0,
  all: 1,
  track: 2,
};

export class AudioEngine {
  private isInitialized = false;
  private sessionId: number | null = null;
  private config: Required<AudioEngineConfig>;
  private isVisualizerRunning = false;
  private isExclusive = false;

  constructor(config: AudioEngineConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      NativePlaybackService.startService();
      await this.refreshSessionId();
      this.isInitialized = true;
      console.log("💎 [AudioEngine] Custom Oboe Engine Ready");
    } catch (error) {
      console.error("❌ [AudioEngine] Setup Failed:", error);
      throw error;
    }
  }

  async toggleExclusiveMode(enabled: boolean): Promise<void> {
    this.isExclusive = enabled;
    console.log(`🚀 [AudioEngine] Exclusive Mode: ${enabled ? "ON" : "OFF"}`);
    if (enabled) {
      await this.releaseAllFX();
    }
  }

  async releaseAllFX(): Promise<void> {
    if (NativeDSPModule?.releaseAllFX) {
      try {
        await NativeDSPModule.releaseAllFX();
        console.log("🔌 [AudioEngine] All FX Released (Bypass)");
      } catch (e) {
        console.warn("Failed to release FX", e);
      }
    }
    stopVisualizer();
    this.isVisualizerRunning = false;
  }

  public async applyDSP(sessionId: number): Promise<void> {
    if (this.isExclusive) return;

    const mode = await AsyncStorage.getItem("audio_mode_preference");
    if (mode === "dsp" && NativeDSPModule) {
      try {
        const bassStrength =
          (await AsyncStorage.getItem("dsp_bass_strength")) || "0";
        await NativeDSPModule.setBassBoost(
          parseInt(bassStrength, 10),
          sessionId,
        );
        console.log(`💎 [AudioEngine] DSP Applied to Session ${sessionId}`);
      } catch (e) {
        console.warn("[AudioEngine] Failed to apply DSP effects", e);
      }
    }
  }

  async setEqBand(bandId: number, gain: number): Promise<void> {
    if (this.isExclusive || !NativeDSPModule) return;
    const id = await this.refreshSessionId();
    if (id) {
      await NativeDSPModule.setEqualizer(bandId, gain, id);
    }
  }

  async setBassBoost(strength: number): Promise<void> {
    if (this.isExclusive || !NativeDSPModule) return;
    const id = await this.refreshSessionId();
    if (id) {
      await NativeDSPModule.setBassBoost(strength, id);
    }
  }

  async setVirtualizer(strength: number): Promise<void> {
    if (this.isExclusive || !NativeDSPModule) return;
    const id = await this.refreshSessionId();
    if (id) {
      await NativeDSPModule.setVirtualizer(strength, id);
    }
  }

  async setReverbPreset(preset: number): Promise<void> {
    if (this.isExclusive || !NativeDSPModule) return;
    const id = await this.refreshSessionId();
    if (id) {
      await NativeDSPModule.setReverbPreset(preset, id);
    }
  }

  private async refreshSessionId(): Promise<number | null> {
    try {
      if (!NativeDSPModule?.createAudioSession) {
        console.warn("[AudioEngine] createAudioSession not available");
        return null;
      }
      const result = await NativeDSPModule.createAudioSession();
      const id = result?.sessionId ?? null;
      if (id && id > 0) {
        this.sessionId = id;
        return id;
      }
      return null;
    } catch (err) {
      console.warn("[AudioEngine] refreshSessionId failed:", err);
      return null;
    }
  }

  async play(): Promise<void> {
    if (!this.isInitialized) await this.initialize();

    NativePlaybackService.play();

    setTimeout(async () => {
      const sessionId = await this.refreshSessionId();
      if (!sessionId) return;

      if (this.isExclusive) {
        console.log("💎 [AudioEngine] Playback: Bit-Perfect (No FX)");
        return;
      }

      const mode = await AsyncStorage.getItem("audio_mode_preference");
      if (mode !== "bit-perfect") {
        await this.applyDSP(sessionId);

        if (!this.isVisualizerRunning) {
          const hasPermission = await requestAudioPermissions();
          if (hasPermission) {
            startVisualizer(sessionId);
            this.isVisualizerRunning = true;
          }
        }
      }
    }, 400);
  }

  async pause(): Promise<void> {
    NativePlaybackService.pause();
    stopVisualizer();
    this.isVisualizerRunning = false;
  }

  async stop(): Promise<void> {
    NativePlaybackService.stop();
    stopVisualizer();
    this.isVisualizerRunning = false;
  }

  async setQueue(songs: Song[], startIndex = 0): Promise<void> {
    if (!this.isInitialized) await this.initialize();
    if (songs.length === 0) return;

    const uris = songs.map((s) => s.uri);
    NativePlaybackService.setQueue(uris);
    if (startIndex > 0) {
      // TODO: implement start index support in native queue
    }
  }

  async seekTo(positionSeconds: number): Promise<void> {
    NativePlaybackService.seek(positionSeconds * 1000);
  }

  async setRepeatMode(mode: RepeatModeType): Promise<void> {
    const nativeMode = REPEAT_MODE_MAP[mode] ?? 0;
    NativePlaybackService.setRepeatMode(nativeMode);
  }

  async setPlaybackRate(rate: number): Promise<void> {
    // native belum mendukung; bisa diabaikan atau dikembangkan nanti
    console.log("setPlaybackRate not implemented yet", rate);
  }

  async getPlaybackState() {
    return {
      state: NativePlaybackService.getStatus(),
    };
  }

  async destroy(): Promise<void> {
    await this.releaseAllFX();
    NativePlaybackService.stopService();
    this.isInitialized = false;
  }
}

export const audioEngine = new AudioEngine();