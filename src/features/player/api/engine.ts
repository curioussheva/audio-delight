import TrackPlayer, {
  Capability,
  RepeatMode,
  State,
  AppKilledPlaybackBehavior
} from "react-native-track-player";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { Song } from "@/shared/types/audio";
import { requestAudioPermissions } from "@/shared/utils/permissions";
import USBDACService from "@/features/hardware/api/usb";
import NativeDSPModule from "@/features/visualizer/native/DSPModule";
import { startVisualizer, stopVisualizer } from "@/features/visualizer/native/VisualizerBridge";

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
      // Optimasi untuk Hi-Res: Beri ruang napas lebih besar pada RAM
      minBuffer: 100,      // Minimal buffer 100ms sebelum mulai suara
      maxBuffer: 300,      // Maksimal buffer 300ms (aman untuk RAM Android)
      playBuffer: 2,       // Playback mulai instan setelah 2ms tersedia
      backBuffer: 60,      // Simpan 60ms ke belakang untuk fitur seek cepat
      waitForBuffer: true,
    });

    await TrackPlayer.updateOptions({
      android: {
        // PENTING: Untuk aplikasi audio murni, kita ingin notifikasi tetap ada 
        // kecuali user benar-benar menutup aplikasi dari recents.
        appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
        alwaysPauseOnInterruption: true, // Berhenti jika ada telepon masuk
        notificationCapabilities: [
          Capability.Play,
          Capability.Pause,
          Capability.SkipToNext,
          Capability.SkipToPrevious,
          Capability.SeekTo,
        ],
      },
      // Kemampuan yang didukung oleh engine
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

    // Ambil Session ID untuk sinkronisasi Visualizer
    await this.refreshSessionId();

    this.isInitialized = true;
    console.log("💎 [AudioEngine] High-Res Engine Ready");
  } catch (error) {
    console.error("❌ [AudioEngine] Setup Failed:", error);
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

    const getContentType = (uri: string): string => {
  const ext = uri.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    flac: 'audio/flac',
    wav:  'audio/wav',
    m4a:  'audio/mp4',
    aac:  'audio/aac',
    ogg:  'audio/ogg',
    opus: 'audio/opus',
    mp3:  'audio/mpeg',
  };
  return map[ext] ?? 'audio/mpeg';
};

    // Hapus anotasi tipe ': tracks' dan perbaiki kurung '()'
    const tracks = songs.map((song) => ({
  id:       song.id,
  url:      song.uri,
  title:    song.title,
  artist:   song.artist,
  album:    song.album || '',
  duration: song.duration,
  artwork:  song.artwork,
  contentType: getContentType(song.uri),  // ← pakai helper
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
