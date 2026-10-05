import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  // Service (sync)
  startService(): void;
  stopService(): void;

  // Transport (Promise — sesuai Kotlin)
  play(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  next(): Promise<void>;
  previous(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  setShuffle(enabled: boolean): Promise<void>;
  setRepeatMode(mode: number): Promise<void>;
  setQueue(uris: string[]): Promise<void>;

  // Query
  getPosition(): Promise<number>;
  getStatus(): Promise<number>;
  getQueue(): Promise<string[]>;
  getCurrentTrack(): Promise<string>;

  // Queue & navigasi (native yang memegang queue dan indeks).
  // getCurrentIndex/getQueueSize sinkron: pembacaan cepat, dipakai untuk
  // menampilkan posisi di queue dan harus akurat setelah next/prev/jumpTo.
  getCurrentIndex(): number;
  getQueueSize(): number;
  jumpTo(index: number): Promise<void>;

  // Media session
  updateMetadata(
    title: string,
    artist: string,
    album: string,
    durationMs: number,
    artworkUri: string | null,
  ): Promise<void>;

  updatePlaybackState(
    isPlaying: boolean,
    positionMs: number,
  ): Promise<void>;

  // 🔥 MediaSession sync untuk shuffle/repeat (lock screen ikut state).
  updateShuffleMode(enabled: boolean): Promise<void>;
  updateRepeatMode(mode: number): Promise<void>;

  // Lazy resolve
  resolveUri(rawUri: string): Promise<string>;
  clearCache(): Promise<number>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativePlaybackService');
