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

  setExclusiveMode: async (
    _dacId: string,
    enabled: boolean,
  ): Promise<{ success: boolean; active: boolean }> => {
    if (!USBDACModule) return { success: false, active: false };
    try {
      // USBDACModule native method expects (dacId, enable)
      const result = await USBDACModule.setExclusiveMode(_dacId, enabled);
      return { success: result?.success ?? true, active: result?.active ?? enabled };
    } catch {
      return { success: false, active: false };
    }
  },

  isExclusiveModeActive: async (): Promise<boolean> => {
    if (!USBDACModule) return false;
    try {
      return await USBDACModule.isExclusiveModeActive();
    } catch {
      return false;
    }
  },

  getRecommendedSettings: async (
    _dacId: string,
  ): Promise<RecommendedSettings> => {
    if (!USBDACModule) {
      return {
        sampleRate: 48000,
        bitDepth: 24,
        exclusiveMode: false,
        exclusiveModeRecommended: false,
        bufferSize: 512,
        dsdMode: "off",
      };
    }
    try {
      const s = await USBDACModule.getRecommendedSettings(_dacId);
      return {
        sampleRate: s?.sampleRate ?? 48000,
        bitDepth: s?.bitDepth ?? 24,
        exclusiveMode: false,
        exclusiveModeRecommended: s?.exclusiveModeRecommended ?? false,
        bufferSize: s?.bufferSize ?? 512,
        dsdMode: s?.dsdMode ?? "off",
      };
    } catch {
      return {
        sampleRate: 48000,
        bitDepth: 24,
        exclusiveMode: false,
        exclusiveModeRecommended: false,
        bufferSize: 512,
        dsdMode: "off",
      };
    }
  },

  addListener: (callback: (dac: DACInfo) => void): (() => void) => {
    const emitter = getEmitter();
    if (!emitter) return () => {};
    const sub = emitter.addListener("onDACChange", callback);
    return () => sub.remove();
  },

  createAudioSession: async (): Promise<number> => {
    if (!USBDACModule) return 0;
    try {
      const result = await USBDACModule.createAudioSession();
      return result?.sessionId ?? 0;
    } catch {
      return 0;
    }
  },

  setEqualizerGains: async (gains: number[]): Promise<boolean> => {
    if (!NativeDSPModule) return false;
    try {
      for (let i = 0; i < gains.length; i++) {
        await NativeDSPModule.setEqualizer(i, gains[i], 0); // 0 = default session
      }
      return true;
    } catch {
      return false;
    }
  },
};

export default USBDACService;