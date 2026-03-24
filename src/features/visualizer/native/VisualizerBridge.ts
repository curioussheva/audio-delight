import { NativeModules, NativeEventEmitter, Platform } from "react-native";

const { NativeVisualizerBridge } = NativeModules;

// Safety check agar tidak crash jika modul gagal di-load
if (Platform.OS === "android" && !NativeVisualizerBridge) {
  console.warn(
    "NativeVisualizerBridge tidak ditemukan. Pastikan sudah terdaftar di USBDACPackage.kt",
  );
}

export const startVisualizer = (audioSessionId: number): Promise<boolean> => {
  if (Platform.OS !== "android") return Promise.resolve(false);
  return NativeVisualizerBridge.startVisualizer(audioSessionId);
};

export const stopVisualizer = () => {
  if (Platform.OS === "android") {
    NativeVisualizerBridge.stopVisualizer();
  }
};

// Pastikan emitter hanya dibuat jika modul ada
export const visualizerEmitter = NativeVisualizerBridge
  ? new NativeEventEmitter(NativeVisualizerBridge)
  : null;
