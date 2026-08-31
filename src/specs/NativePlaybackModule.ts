import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  play(): void;
  pause(): void;
  stop(): void;
  seek(positionMs: number): void;
  getPosition(): number;
  getStatus(): number;
  next(): void;
  previous(): void;
  setShuffle(enabled: boolean): void;
  setRepeatMode(mode: number): void;
  getQueue(): string[];
  setQueue(uris: string[]): void;
  getCurrentTrack(): string;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativePlaybackModule');