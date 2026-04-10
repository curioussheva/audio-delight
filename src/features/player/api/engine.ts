import TrackPlayer, {
  Capability,
  RepeatMode,
  AppKilledPlaybackBehavior,
} from "react-native-track-player";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { Song } from "@/shared/types/audio";
import { requestAudioPermissions } from "@/shared/utils/permissions";
import USBDACService from "@/features/hardware/api/USBDACModule";
import NativeDSPModule from "@/features/visualizer/native/NativeDSPModule";
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
  private isExclusive = false;

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

  // ─── DSP & Bit-Perfect Logic (Fungsi yang sebelumnya Hilang) ───

  /**
   * Mengaktifkan/Matikan Mode Bit-Perfect (Hardware Exclusive)
   */
  async toggleExclusiveMode(enabled: boolean): Promise<void> {
    this.isExclusive = enabled;
    console.log(`🚀 [AudioEngine] Exclusive Mode: ${enabled ? "ON" : "OFF"}`);

    if (enabled) {
      // Matikan semua FX saat masuk mode Bit-Perfect
      await this.releaseAllFX();
      // Integrasi dengan USBDACService jika tersedia di Native
      if (USBDACService) {
        // Logika internal USBDAC bisa dipanggil di sini
      }
    }
  }

  /**
   * Menghapus semua efek audio dari session saat ini
   */
  async releaseAllFX(): Promise<void> {
    const id = await this.refreshSessionId();
    if (id && NativeDSPModule) {
      try {
        await (NativeDSPModule as any).releaseAllFX?.(id);
        stopVisualizer();
        this.isVisualizerRunning = false;
        console.log("🔌 [AudioEngine] All FX Released (Bypass)");
      } catch (e) {
        console.warn("Failed to release FX", e);
      }
    }
  }

  /**
   * Menerapkan seluruh preset DSP yang tersimpan
   */
  public async applyDSP(sessionId: number): Promise<void> {
    // Jangan terapkan DSP jika dalam mode Bit-Perfect
    if (this.isExclusive) return;

    const mode = await AsyncStorage.getItem("audio_mode_preference");
    if (mode === "dsp" && NativeDSPModule) {
      try {
        const bassStrength =
          (await AsyncStorage.getItem("dsp_bass_strength")) || "0";
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

  // ─── Kontrol Efek Spesifik ──────────────────────────

  async setEqBand(bandId: number, gain: number): Promise<void> {
    const id = await this.refreshSessionId();
    if (id && !this.isExclusive && NativeDSPModule) {
      await (NativeDSPModule as any).setEqBand?.(bandId, gain, id);
    }
  }

  async setBassBoost(strength: number): Promise<void> {
    const id = await this.refreshSessionId();
    if (id && !this.isExclusive && NativeDSPModule) {
      await (NativeDSPModule as any).setBassBoost?.(strength, id);
    }
  }

  async setVirtualizer(strength: number): Promise<void> {
    const id = await this.refreshSessionId();
    if (id && !this.isExclusive && NativeDSPModule) {
      await (NativeDSPModule as any).setVirtualizer(strength, id);
    }
  }

  async setReverbPreset(preset: number): Promise<void> {
    const id = await this.refreshSessionId();
    if (id && !this.isExclusive && NativeDSPModule) {
      await (NativeDSPModule as any).setReverbPreset?.(preset, id);
    }
  }

  // ─── Lifecycle & Playback ───────────────────────────

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

  async play(): Promise<void> {
    if (!this.isInitialized) await this.initialize();

    await TrackPlayer.play();

    // Sync DSP & Visualizer setelah play (delay sedikit agar session ID stabil)
    setTimeout(async () => {
      const sessionId = await this.refreshSessionId();
      if (!sessionId) return;

      // Jika Bit-Perfect aktif, kita bypass semua langkah di bawah
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
    await TrackPlayer.pause();
    stopVisualizer();
    this.isVisualizerRunning = false;
  }

  async stop(): Promise<void> {
    await TrackPlayer.stop();
    stopVisualizer();
    this.isVisualizerRunning = false;
  }

  // ─── Utils ──────────────────────────────────────────

  async setQueue(songs: Song[], startIndex = 0): Promise<void> {
    if (!this.isInitialized) await this.initialize();
    if (songs.length === 0) return;

    await TrackPlayer.reset();
    const tracks = songs.map((s) => ({
      id: s.id,
      url: s.uri,
      title: s.title,
      artist: s.artist,
      album: s.album || "",
      duration: s.duration,
      artwork: s.artwork,
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

  async setPlaybackRate(rate: number): Promise<void> {
    await TrackPlayer.setRate(rate);
  }

  async getPlaybackState() {
    return await TrackPlayer.getState();
  }

  async destroy(): Promise<void> {
    await this.releaseAllFX();
    await TrackPlayer.reset();
    this.isInitialized = false;
  }
}

export const audioEngine = new AudioEngine();
