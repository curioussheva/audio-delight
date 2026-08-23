// src/features/visualizer/native/VisualizerBridge.ts

import { NativeModules } from "react-native";

const Platform = require("react-native").Platform;

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

if (Platform.OS === "android" && !NativeVisualizerBridge) {
  console.warn(
    "[VisualizerBridge] NativeVisualizerBridge tidak ditemukan. " +
      "Pastikan sudah terdaftar di USBDACPackage.kt dan MainApplication.kt",
  );
}

// Karena native TIDAK mengirim event, seluruh akses data FFT
// harus melalui visualizerService (polling getFFTData).
// File ini hanya menyediakan helper start/stop tipis.

export const startVisualizer = async (
  audioSessionId: number,
): Promise<boolean> => {
  if (Platform.OS !== "android") return false;
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
  if (Platform.OS !== "android") return;
  if (!NativeVisualizerBridge) return;
  try {
    NativeVisualizerBridge.stopVisualizer();
  } catch (e) {
    console.error("[VisualizerBridge] Failed to stop:", e);
  }
};

export const isVisualizerAvailable = (): boolean => {
  return Platform.OS === "android" && !!NativeVisualizerBridge;
};

export default NativeVisualizerBridge;