import { NativeModules, NativeEventEmitter } from "react-native";

export interface DACCapabilities {
  dsdNative: boolean;
  dsdDoP: boolean;
  mqaRenderer: boolean;
  hardwareVolume: boolean;
}

export interface DACInfo {
  id: string;
  name: string;
  manufacturer?: string;
  productId?: number;
  vendorId?: number;
  isConnected: boolean;
  currentSampleRate?: number;
  sampleRates?: number[];
  bitDepths: number[];
  channelCounts?: number[];
  capabilities: DACCapabilities;
}

export interface DACConfig {
  dacId?: string;
  sampleRate?: number | "auto";
  bitDepth?: number;
  exclusiveMode?: boolean;
  gainDb?: number;
  bufferSize?: number;
  dsdMode?: "native" | "dop" | "off";
  mqaMode?: "renderer" | "off";
  volumeControl?: "hardware" | "software";
}

export interface RecommendedSettings {
  sampleRate: number;
  bitDepth: number;
  exclusiveMode: boolean;
  exclusiveModeRecommended: boolean;
  bufferSize: number;
  dsdMode: "native" | "dop" | "off";
}

const { USBDACModule, NativeDSPModule } = NativeModules;

let _emitter: NativeEventEmitter | null = null;
const getEmitter = () => {
  if (!_emitter && USBDACModule) _emitter = new NativeEventEmitter(USBDACModule);
  return _emitter;
};

export const USBDACService = {
  detectDACs: async (): Promise<DACInfo[]> => {
    if (!USBDACModule) return [];
    return await USBDACModule.detectDACs();
  },
  setExclusiveMode: async (_dacId: string, enabled: boolean): Promise<{ success: boolean; active: boolean }> => {
    if (!NativeDSPModule) return { success: false, active: false };
    try {
      await NativeDSPModule.setExclusiveMode(enabled);
      return { success: true, active: enabled };
    } catch { return { success: false, active: false }; }
  },
  isExclusiveModeActive: async (): Promise<boolean> => {
    if (!NativeDSPModule) return false;
    try {
      const result = await NativeDSPModule.createAudioSession();
      return result?.isNew === false;
    } catch { return false; }
  },
  getRecommendedSettings: async (_dacId: string): Promise<RecommendedSettings> => {
    return { sampleRate: 48000, bitDepth: 24, exclusiveMode: false, exclusiveModeRecommended: false, bufferSize: 512, dsdMode: "off" };
  },
  addListener: (callback: (dac: DACInfo) => void): (() => void) => {
    const emitter = getEmitter();
    if (!emitter) return () => {};
    const sub = emitter.addListener("onDACConnected", callback);
    return () => sub.remove();
  },
  createAudioSession: async (): Promise<number> => 0,
  setEqualizerGains: async (gains: number[]): Promise<boolean> => {
    if (!NativeDSPModule) return false;
    gains.forEach((gain, index) => NativeDSPModule.setEqualizerBand(index, gain));
    return true;
  },
};

export default USBDACService;
