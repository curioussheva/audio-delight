import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  setEqualizer(band: number, level: number, sessionId: number): Promise<boolean>;
  setFullEqualizer(gains: number[], sessionId: number): Promise<boolean>;
  setBassBoost(strength: number, sessionId: number): Promise<boolean>;
  setVirtualizer(strength: number, sessionId: number): Promise<boolean>;
  setReverbPreset(preset: number, sessionId: number): Promise<boolean>;
  releaseAllFX(): Promise<boolean>;
  createAudioSession(): Promise<object>;
  setMasterGain(gain: number): void;
  setBalance(balance: number): void;
  setExclusiveMode(enabled: boolean): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeDSPModule');
