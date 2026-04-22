// src/features/visualizer/native/NativeDSPModule.ts
import { NativeModules } from "react-native";
const Platform = require("react-native").Platform;

interface NativeDSPModuleType {
  // Equalizer
  setEqualizer(
    band: number,
    level: number,
    audioSessionId: number,
  ): Promise<boolean>;
  setFullEqualizer(gains: number[], audioSessionId: number): Promise<boolean>;

  // Effects
  setBassBoost(strength: number, audioSessionId: number): Promise<boolean>;
  setVirtualizer(strength: number, audioSessionId: number): Promise<boolean>;
  setReverbPreset(preset: number, audioSessionId: number): Promise<boolean>;

  // Cleanup
  releaseAllFX(): Promise<boolean>;
}

const NativeDSPModule = NativeModules.NativeDSPModule as
  | NativeDSPModuleType
  | undefined;

if (require("react-native").Platform.OS === "android" && !NativeDSPModule) {
  console.warn(
    "[NativeDSPModule] Not available. Check USBDACPackage registration.",
  );
}

// Wrapper dengan error handling
export const DSPModule = {
  setEqualizer: async (
    band: number,
    level: number,
    sessionId: number,
  ): Promise<boolean> => {
    if (!NativeDSPModule) return false;
    try {
      return await NativeDSPModule.setEqualizer(band, level, sessionId);
    } catch (e) {
      console.error("[DSPModule] setEqualizer failed:", e);
      return false;
    }
  },

  setFullEqualizer: async (
    gains: number[],
    sessionId: number,
  ): Promise<boolean> => {
    if (!NativeDSPModule) return false;
    try {
      return await NativeDSPModule.setFullEqualizer(gains, sessionId);
    } catch (e) {
      console.error("[DSPModule] setFullEqualizer failed:", e);
      return false;
    }
  },

  setBassBoost: async (
    strength: number,
    sessionId: number,
  ): Promise<boolean> => {
    if (!NativeDSPModule) return false;
    try {
      return await NativeDSPModule.setBassBoost(strength, sessionId);
    } catch (e) {
      console.error("[DSPModule] setBassBoost failed:", e);
      return false;
    }
  },

  setVirtualizer: async (
    strength: number,
    sessionId: number,
  ): Promise<boolean> => {
    if (!NativeDSPModule) return false;
    try {
      return await NativeDSPModule.setVirtualizer(strength, sessionId);
    } catch (e) {
      console.error("[DSPModule] setVirtualizer failed:", e);
      return false;
    }
  },

  setReverbPreset: async (
    preset: number,
    sessionId: number,
  ): Promise<boolean> => {
    if (!NativeDSPModule) return false;
    try {
      return await NativeDSPModule.setReverbPreset(preset, sessionId);
    } catch (e) {
      console.error("[DSPModule] setReverbPreset failed:", e);
      return false;
    }
  },

  releaseAllFX: async (): Promise<boolean> => {
    if (!NativeDSPModule) return false;
    try {
      return await NativeDSPModule.releaseAllFX();
    } catch (e) {
      console.error("[DSPModule] releaseAllFX failed:", e);
      return false;
    }
  },
};

export default DSPModule;
