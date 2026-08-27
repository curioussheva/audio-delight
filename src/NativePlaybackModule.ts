import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  play(): void;
  pause(): void;
  stop(): void;
  seek(positionMs: number): void;
  getPosition(): number;
  getStatus(): number;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativePlaybackModule');