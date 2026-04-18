import { NativeModules } from "react-native";

export interface NativeDSPInterface {
  setMasterGain(gain: number): void;
  setSoundstage(width: number): void;
  setEqualizerBand(band: number, gain: number): void;
  setBassBoost(gain: number): void;
  setBalance(balance: number): void;
  setEqualizer(band: number, level: number, sessionId: number): Promise<boolean>;
  setFullEqualizer(gains: number[], sessionId: number): Promise<boolean>;
  setVirtualizer(strength: number, sessionId: number): Promise<boolean>;
  setReverbPreset(preset: number, sessionId: number): Promise<boolean>;
  releaseAllFX(): Promise<boolean>;
  createAudioSession(): Promise<{ sessionId: number; isNew: boolean }>;
  setExclusiveMode(enabled: boolean): void;
}

const { NativeDSPModule } = NativeModules;

if (!NativeDSPModule) {
  console.error("NativeDSPModule tidak ditemukan! Pastikan library native sudah ter-load.");
}

// Named export agar bisa diimport sebagai { NativeDSPModule }
export { NativeDSPModule };
export default NativeDSPModule as NativeDSPInterface;
