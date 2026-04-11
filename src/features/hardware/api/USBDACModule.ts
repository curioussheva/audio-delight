// src/features/hardware/api/USBDACModule.ts
import { NativeModules, NativeEventEmitter, Platform } from "react-native";

// ============================================================================
// Types
// ============================================================================

export interface DACCapabilities {
  hiRes: boolean;
  dsdDoP: boolean;
  mqaRenderer: boolean;
}

export interface DACInfo {
  id: string;
  name: string;
  manufacturer?: string;
  type: string;
  sampleRates: number[];
  channelCounts: number[];
  bitDepths: number[];
  capabilities: DACCapabilities;
  supportsHiRes: boolean;
  currentSampleRate: number;
}

export interface DACConfig {
  dacId: string;
  exclusiveMode: boolean;
  sampleRate: number | "auto";
  bitDepth: number;
  bufferSize: number;
  dsdMode: "native" | "dop" | "off";
  mqaMode: "renderer" | "off";
  volumeControl: "hardware" | "software";
}

export interface ExclusiveModeResult {
  success: boolean;
  active: boolean;
  mode: "exclusive" | "system";
}

// ============================================================================
// Native Module Interface (Sync with Kotlin @ReactMethod)
// ============================================================================

interface NativeUSBDACModuleType {
  // 1. Detection
  detectDACs(): Promise<DACInfo[]>;
  
  // 2. Settings & Exclusive Mode
  setExclusiveMode(dacId: string, enabled: boolean): Promise<ExclusiveModeResult>;
  isExclusiveModeActive(): Promise<boolean>;
  setSampleRate(sampleRate: number): Promise<{ success: boolean; sampleRate: number }>;
  getRecommendedSettings(dacId: string): Promise<{
    sampleRate: number;
    bitDepth: number;
    bufferSize: number;
    dsdMode: string;
    exclusiveModeRecommended: boolean;
  }>;

  // 3. Audio Session & Equalizer
  createAudioSession(): Promise<{ sessionId: number; isNew: boolean }>;
  releaseAudioSession(): Promise<boolean>;
  getCurrentAudioSessionId(): Promise<number>;
  setEqualizerGains(gains: number[], audioSessionId: number): Promise<boolean>;
  releaseEqualizer(): Promise<boolean>;

  // 4. Event Emitter Requirements
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

// ============================================================================
// Module Resolution
// ============================================================================

const NativeModule = NativeModules.USBDACModule as NativeUSBDACModuleType | undefined;

if (Platform.OS === "android" && !NativeModule) {
  console.warn("[USBDACModule] Not available. Check MainApplication registration.");
}

export const usbDacEmitter = NativeModule
  ? new NativeEventEmitter(NativeModule as any)
  : null;

// ============================================================================
// Service Object (Logic Layer)
// ============================================================================

export const USBDACService = {
  // ─── DAC Detection ──────────────────────────────────────────────────────────
  detectDACs: async (): Promise<DACInfo[]> => {
    if (!NativeModule) return [];
    try {
      return await NativeModule.detectDACs();
    } catch (e) {
      console.error("[USBDACService] detectDACs failed:", e);
      return [];
    }
  },

  // ─── Event Listeners ────────────────────────────────────────────────────────
  addListener: (callback: (dac: DACInfo | null) => void): (() => void) => {
    if (!usbDacEmitter) return () => {};

    const sub = usbDacEmitter.addListener("onDACChange", (event: any) => {
      if (event.status === "connected" && event.dac) {
        callback(event.dac as DACInfo);
      } else if (event.status === "disconnected") {
        callback(null);
      }
    });

    return () => sub.remove();
  },

  // ─── Exclusive Mode ─────────────────────────────────────────────────────────
  setExclusiveMode: async (dacId: string, enabled: boolean): Promise<ExclusiveModeResult> => {
    if (!NativeModule) {
      return { success: false, active: false, mode: "system" };
    }
    try {
      return await NativeModule.setExclusiveMode(dacId, enabled);
    } catch (e) {
      console.error("[USBDACService] setExclusiveMode failed:", e);
      return { success: false, active: false, mode: "system" };
    }
  },

  isExclusiveModeActive: async (): Promise<boolean> => {
    if (!NativeModule) return false;
    try {
      return await NativeModule.isExclusiveModeActive();
    } catch (e) {
      return false;
    }
  },

  // ─── Audio Settings ─────────────────────────────────────────────────────────
  setSampleRate: async (sampleRate: number): Promise<boolean> => {
    if (!NativeModule) return false;
    try {
      const result = await NativeModule.setSampleRate(sampleRate);
      return result.success;
    } catch (e) {
      console.error("[USBDACService] setSampleRate failed:", e);
      return false;
    }
  },

  getRecommendedSettings: async (dacId: string) => {
    if (!NativeModule) {
      return {
        sampleRate: 48000,
        bitDepth: 16,
        bufferSize: 512,
        dsdMode: "off",
        exclusiveModeRecommended: false,
      };
    }
    try {
      return await NativeModule.getRecommendedSettings(dacId);
    } catch (e) {
      console.error("[USBDACService] getRecommendedSettings failed:", e);
      return {
        sampleRate: 48000,
        bitDepth: 16,
        bufferSize: 512,
        dsdMode: "off",
        exclusiveModeRecommended: false,
      };
    }
  },

  // ─── Session & Equalizer Management ─────────────────────────────────────────
  createAudioSession: async (): Promise<number> => {
    if (!NativeModule) return 0;
    try {
      const result = await NativeModule.createAudioSession();
      return result.sessionId;
    } catch (e) {
      console.error("[USBDACService] createAudioSession failed:", e);
      return 0;
    }
  },

  releaseAudioSession: async (): Promise<boolean> => {
    if (!NativeModule) return false;
    try {
      return await NativeModule.releaseAudioSession();
    } catch (e) {
      return false;
    }
  },

  getCurrentAudioSessionId: async (): Promise<number> => {
    if (!NativeModule) return -1;
    try {
      return await NativeModule.getCurrentAudioSessionId();
    } catch (e) {
      return -1;
    }
  },

  setEqualizerGains: async (gains: number[], audioSessionId: number): Promise<boolean> => {
    if (!NativeModule) return false;
    try {
      return await NativeModule.setEqualizerGains(gains, audioSessionId);
    } catch (e) {
      console.error("[USBDACService] setEqualizerGains failed:", e);
      return false;
    }
  },

  releaseEqualizer: async (): Promise<boolean> => {
    if (!NativeModule) return false;
    try {
      return await NativeModule.releaseEqualizer();
    } catch (e) {
      return false;
    }
  }
};

export default USBDACService;
 