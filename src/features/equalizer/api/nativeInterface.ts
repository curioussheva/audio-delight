import { NativeModules } from "react-native";

export interface NativeDSPInterface {
  // Equalizer
  setEqBand(bandIndex: number, gain: number, sessionId?: number): Promise<void>;

  // Efek Bass & Virtualizer (Ini yang tadi bikin error)
  setBassBoost(strength: number, sessionId?: number): Promise<void>;
  setVirtualizer(level: number, sessionId?: number): Promise<void>;

  // Reverb
  setReverbPreset(presetIndex: number, sessionId?: number): Promise<void>;

  // Management
  releaseAllFX(sessionId?: number): Promise<void>;
  getAudioSessionId(): Promise<number>; // Penting untuk Android
}

// Casting agar modul native dikenali sebagai interface di atas
export const NativeDSPModule =
  NativeModules.PristineDSPModule as NativeDSPInterface;
