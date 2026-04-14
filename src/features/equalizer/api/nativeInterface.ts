// src/features/equalizer/api/nativeInterface.ts
import { NativeModules } from "react-native";

export interface NativeDSPInterface {
  setEqBand(bandIndex: number, gain: number, sessionId?: number): Promise<boolean>;
  setFullEqualizer(gains: number[], sessionId: number): Promise<boolean>;
  setBandLevel(band: number, level: number, sessionId: number): Promise<boolean>;

  setBassBoost(strength: number, sessionId?: number): Promise<boolean>;
  setVirtualizer(level: number, sessionId?: number): Promise<boolean>;
  setReverbPreset(presetIndex: number, sessionId?: number): Promise<boolean>;

  releaseAllFX(sessionId?: number): Promise<boolean>;
  reset(): Promise<boolean>;

  getAudioSessionId(): Promise<number>;
  getActiveAudioSessionId(): Promise<number>;
}


export const NativeDSPModule =
  NativeModules.NativeDSPModule as NativeDSPInterface;
