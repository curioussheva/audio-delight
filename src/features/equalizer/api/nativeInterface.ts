import { NativeModules } from "react-native";

export interface NativeDSPInterface {
  // Equalizer
  setEqBand(bandIndex: number, gain: number, sessionId?: number): Promise<void>;
  setFullEqualizer(gains: number[], sessionId: number): Promise<boolean>;
  setBandLevel(band: number, level: number, sessionId: number): Promise<void>;

  // Bass & Virtualizer
  setBassBoost(strength: number, sessionId?: number): Promise<void>;
  setVirtualizer(level: number, sessionId?: number): Promise<void>;

  // Reverb
  setReverbPreset(presetIndex: number, sessionId?: number): Promise<void>;

  // Management
  releaseAllFX(sessionId?: number): Promise<void>;
  reset(): Promise<void>;

  // Session ID
  getAudioSessionId(): Promise<number>;
  getActiveAudioSessionId(): Promise<number>;
}

export const NativeDSPModule =
  NativeModules.NativeDSPModule as NativeDSPInterface;
