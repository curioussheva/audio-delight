// src/features/equalizer/api/nativeInterface.ts
import { NativeModules } from "react-native";

export interface NativeDSPInterface {
  // Ganti setEqBand → setEqualizer (sesuai nama di Kotlin)
  setEqualizer(band: number, level: number, audioSessionId: number): Promise<boolean>;
  setFullEqualizer(gains: number[], audioSessionId: number): Promise<boolean>;
  setBandLevel(band: number, level: number, audioSessionId: number): Promise<boolean>;

  setBassBoost(strength: number, audioSessionId: number): Promise<boolean>;
  setVirtualizer(strength: number, audioSessionId: number): Promise<boolean>;
  setReverbPreset(presetIndex: number, audioSessionId: number): Promise<boolean>;

  releaseAllFX(): Promise<boolean>;
  reset(): Promise<boolean>;

  getAudioSessionId(): Promise<number>;
  getActiveAudioSessionId(): Promise<number>;
}

export const NativeDSPModule =
  NativeModules.NativeDSPModule as NativeDSPInterface;
