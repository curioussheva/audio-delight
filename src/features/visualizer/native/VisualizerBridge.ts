// src/features/visualizer/native/VisualizerBridge.ts

import { NativeModules, NativeEventEmitter } from "react-native";
const Platform = require("react-native").Platform;

// ============================================================================
// Type Definitions
// ============================================================================

export type FftData = number[]; // 128 bins, values 0.0-1.0

interface NativeVisualizerBridgeType {
  startVisualizer(audioSessionId: number): Promise<boolean>;
  stopVisualizer(): void;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

// ============================================================================
// Native Module Resolution
// ============================================================================

const NativeVisualizerBridge = NativeModules.NativeVisualizerBridge as
  | NativeVisualizerBridgeType
  | undefined;

// Safety check
if (Platform.OS === "android" && !NativeVisualizerBridge) {
  console.warn(
    "[VisualizerBridge] NativeVisualizerBridge tidak ditemukan. " +
      "Pastikan sudah terdaftar di USBDACPackage.kt dan MainApplication.kt",
  );
}

// Event emitter initialization
export const visualizerEmitter = NativeVisualizerBridge
  ? new NativeEventEmitter(NativeVisualizerBridge)
  : null;

// ============================================================================
// Public API
// ============================================================================

/**
 * Start visualizer with given audio session ID
 * @param audioSessionId - Audio session ID from player (must be > 0)
 * @returns Promise<boolean> - true if started successfully
 */
export const startVisualizer = async (
  audioSessionId: number,
): Promise<boolean> => {
  if (Platform.OS !== "android") {
    return false;
  }

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

/**
 * Stop visualizer and release native resources
 */
export const stopVisualizer = (): void => {
  if (Platform.OS !== "android") return;
  if (!NativeVisualizerBridge) return;

  try {
    NativeVisualizerBridge.stopVisualizer();
  } catch (e) {
    console.error("[VisualizerBridge] Failed to stop:", e);
  }
};

/**
 * Subscribe to FFT data from native visualizer
 * @param callback - Function called with 128-bin FFT data (0.0-1.0 range)
 * @returns Unsubscribe function - call this to cleanup
 *
 * @example
 * const unsubscribe = subscribeToFft((data) => {
 *   console.log("FFT bins:", data.length); // 128
 *   console.log("First bin:", data[0]);    // 0.0-1.0
 * });
 *
 * // Cleanup
 * unsubscribe();
 */
export const subscribeToFft = (
  callback: (data: FftData) => void,
): (() => void) => {
  if (!visualizerEmitter) {
    console.warn("[VisualizerBridge] Cannot subscribe: emitter not available");
    return () => {}; // No-op
  }

  const subscription = visualizerEmitter.addListener(
    "onFftData",
    (data: FftData) => {
      // Validasi data dari native
      if (!Array.isArray(data)) {
        console.warn("[VisualizerBridge] Received non-array data:", data);
        return;
      }
      if (data.length !== 128) {
        console.warn(
          `[VisualizerBridge] Expected 128 bins, got ${data.length}`,
        );
        return;
      }

      // Validasi range value (optional tapi recommended)
      const hasInvalid = data.some(
        (v) => typeof v !== "number" || v < 0 || v > 1,
      );
      if (hasInvalid) {
        console.warn("[VisualizerBridge] Data contains invalid values");
      }

      callback(data);
    },
  );

  // Return cleanup function
  return () => {
    try {
      subscription.remove();
    } catch (e) {
      console.error("[VisualizerBridge] Failed to remove listener:", e);
    }
  };
};

/**
 * Check if visualizer is available on this platform
 */
export const isVisualizerAvailable = (): boolean => {
  return Platform.OS === "android" && !!NativeVisualizerBridge;
};
