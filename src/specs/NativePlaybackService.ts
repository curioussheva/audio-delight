import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  startService(): void;
  stopService(): void;
  play(): void;
  pause(): void;
  stop(): void;
  next(): void;
  previous(): void;
  seek(positionMs: number): void;
  getPosition(): number;
  getStatus(): number;
  setShuffle(enabled: boolean): void;
  setRepeatMode(mode: number): void;
  getQueue(): string[];
  setQueue(uris: string[]): void;
  getCurrentTrack(): string;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativePlaybackService');