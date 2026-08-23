import { NativeModules } from "react-native";

export interface NativeDSPInterface {
  // Equalizer & effects
  setEqualizer(band: number, level: number, sessionId: number): Promise<boolean>;
  setFullEqualizer(gains: number[], sessionId: number): Promise<boolean>;
  setBassBoost(strength: number, sessionId: number): Promise<boolean>;
  setVirtualizer(strength: number, sessionId: number): Promise<boolean>;
  setReverbPreset(preset: number, sessionId: number): Promise<boolean>;
  releaseAllFX(): Promise<boolean>;

  // Audio session
  createAudioSession(): Promise<{ sessionId: number; isNew: boolean }>;

  // Direct controls
  setMasterGain(gain: number): void;
  setBalance(balance: number): void;
  setExclusiveMode(enabled: boolean): void;

  // Additional engine controls
  setDSPEnabled(enabled: boolean): void;
  setLimiterEnabled(enabled: boolean): void;
  setSolfeggioFreq(freq: number): void;
  setBrainwaveFreq(freq: number): void;
  setResonanceIntensity(intensity: number): void;
  setImmersiveEnabled(enabled: boolean): void;
}

const { NativeDSPModule } = NativeModules;

if (!NativeDSPModule) {
  console.error("NativeDSPModule tidak ditemukan! Pastikan library native sudah ter-load.");
}

export { NativeDSPModule };
export default NativeDSPModule as NativeDSPInterface;