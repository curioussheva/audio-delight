import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  startVisualizer(audioSessionId: number): Promise<boolean>;
  stopVisualizer(): void;
  getFFTData(): Promise<number[]>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeVisualizerBridge');
