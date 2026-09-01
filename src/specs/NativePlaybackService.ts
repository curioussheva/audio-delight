import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  startService(): void;
  stopService(): void;
  play(): void;
  pause(): void;
  next(): void;
  previous(): void;
  seek(positionMs: number): void;
  getQueue(): string[];
  setQueue(uris: string[]): void;
  getCurrentTrack(): string;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativePlaybackService');