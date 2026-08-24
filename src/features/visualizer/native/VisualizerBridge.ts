// src/features/visualizer/native/VisualizerBridge.ts
import { NativeModules } from "react-native";

export type FftData = number[];

interface NativeVisualizerBridgeType {
  startVisualizer(audioSessionId: number): Promise<boolean>;
  stopVisualizer(): void;
  getFFTData(): Promise<number[]>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

const NativeVisualizerBridge = NativeModules.NativeVisualizerBridge as
  | NativeVisualizerBridgeType
  | undefined;

// Lazy Platform access — jangan panggil Platform.OS di top-level module scope,
// itu trigger TurboModuleRegistry.getEnforcing('PlatformConstants') sebelum
// native runtime siap kalau file ini ke-import lebih awal di rantai boot.
const getPlatformOS = (): string => {
  try {
    return require("react-native").Platform.OS;
  } catch {
    return "android";
  }
};

let warnedMissing = false;
const warnIfMissing = () => {
  if (warnedMissing) return;
  if (getPlatformOS() === "android" && !NativeVisualizerBridge) {
    console.warn(
      "[VisualizerBridge] NativeVisualizerBridge tidak ditemukan. " +
      "Pastikan sudah terdaftar di USBDACPackage.kt dan MainApplication.kt",
    );
    warnedMissing = true;
  }
};

// Karena native TIDAK mengirim event, seluruh akses data FFT
// harus melalui visualizerService (polling getFFTData).
// File ini hanya menyediakan helper start/stop tipis.
export const startVisualizer = async (
  audioSessionId: number,
): Promise<boolean> => {
  warnIfMissing();
  if (getPlatformOS() !== "android") return false;
  if (!NativeVisualizerBridge) {
    console.warn("[VisualizerBridge] Cannot start: module not available");
    return false;
  }
  if (audioSessionId === 0) {
    throw new Error("[VisualizerBridge] Invalid audio session ID: 0");
  }
  try {
    return await NativeVisualizerBridge.startVisualizer(audioSessionId);
  } catch (e) {
    console.error("[VisualizerBridge] Failed to start:", e);
    throw e;
  }
};

export const stopVisualizer = (): void => {
  if (getPlatformOS() !== "android") return;
  if (!NativeVisualizerBridge) return;
  try {
    NativeVisualizerBridge.stopVisualizer();
  } catch (e) {
    console.error("[VisualizerBridge] Failed to stop:", e);
  }
};

export const isVisualizerAvailable = (): boolean => {
  return getPlatformOS() === "android" && !!NativeVisualizerBridge;
};
