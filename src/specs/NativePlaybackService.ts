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
  setShuffle(enabled: boolean): void;
  setRepeatMode(mode: number): void;
  setQueue(uris: string[]): void;
  getPosition(): Promise<number>;
  getStatus(): Promise<number>;
  getQueue(): Promise<string[]>;
  getCurrentTrack(): Promise<string>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativePlaybackService');