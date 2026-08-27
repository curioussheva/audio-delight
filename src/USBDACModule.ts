import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  detectDACs(): Promise<object[]>;
  isExclusiveModeActive(): Promise<boolean>;
  setExclusiveMode(dacId: string, enable: boolean): Promise<object>;
  setSampleRate(rate: number): Promise<object>;
  getRecommendedSettings(dacId: string): Promise<object>;
  createAudioSession(): Promise<object>;
  getCurrentAudioSessionId(): Promise<number>;
  releaseAudioSession(): Promise<boolean>;
  setEqualizerGains(gains: number[], audioSessionId: number): Promise<boolean>;
  releaseEqualizer(): Promise<boolean>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('USBDACModule');