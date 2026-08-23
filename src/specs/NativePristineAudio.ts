import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  startEngine(): void;
  stopEngine(): void;
  pushAudio(data: number[], size: number): void;
  isRunning(): boolean;
  getLatency(): number;
  getUnderruns(): number;
  getOverruns(): number;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativePristineAudio');