// src/features/visualizer/services/VisualizerService.ts

import {
  AppState,
  AppStateStatus,
  NativeModules,
  NativeEventEmitter,
  EmitterSubscription,
  Platform,
} from "react-native";
import { SharedValue, runOnJS } from "react-native-reanimated";

// ============================================================================
// Types
// ============================================================================

interface NativeVisualizerBridgeType {
  startVisualizer(audioSessionId: number): Promise<boolean>;
  stopVisualizer(): void;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

interface VisualizerConfig {
  smoothingFactor?: number; // 0-1, default 0.3
  minDecibels?: number; // default -100
  maxDecibels?: number; // default -30
}

// ============================================================================
// Module Resolution
// ============================================================================

const NativeVisualizerBridge = NativeModules.NativeVisualizerBridge as
  | NativeVisualizerBridgeType
  | undefined;

const visualizerEmitter = NativeVisualizerBridge
  ? new NativeEventEmitter(NativeVisualizerBridge as any)
  : null;

// ============================================================================
// Service Class
// ============================================================================

class VisualizerService {
  // State
  private frequencyData: SharedValue<number[]> | null = null;
  private subscription: EmitterSubscription | null = null;
  private appStateSubscription: ReturnType<
    typeof AppState.addEventListener
  > | null = null;

  // Status
  private isStarted: boolean = false;
  private isPaused: boolean = false;
  private lastSessionId: number = 0;
  private retryCount: number = 0;
  private readonly maxRetries = 3;

  // Config
  private config: VisualizerConfig = {
    smoothingFactor: 0.3,
    minDecibels: -100,
    maxDecibels: -30,
  };

  // Data smoothing
  private previousData: number[] | null = null;

  constructor() {
    this.setupAppStateListener();
  }

  // ============================================================================
  // Lifecycle Management
  // ============================================================================

  private setupAppStateListener() {
    // ✅ CLEANUP existing dulu
    this.cleanupAppStateListener();

    this.appStateSubscription = AppState.addEventListener(
      "change",
      this.handleAppStateChange,
    );
  }

  private cleanupAppStateListener() {
    // ✅ PROPER CLEANUP untuk AppState
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
  }

  private handleAppStateChange = (nextAppState: AppStateStatus) => {
    // ✅ Gunakan enum comparison, bukan regex
    const isInactive =
      nextAppState === "inactive" || nextAppState === "background";
    const isActive = nextAppState === "active";

    if (isInactive && this.isStarted && !this.isPaused) {
      console.log(
        "[VisualizerService] Pausing due to app state:",
        nextAppState,
      );
      this.pause();
    } else if (isActive && this.isPaused && this.lastSessionId !== 0) {
      console.log("[VisualizerService] Resuming due to active state");
      this.resume();
    }
  };

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Initialize dengan SharedValue dari Reanimated
   * Harus dipanggil sebelum start()
   */
  initialize(
    sharedValue: SharedValue<number[]>,
    config?: Partial<VisualizerConfig>,
  ): boolean {
    // ✅ VALIDASI shared value
    if (!sharedValue || typeof sharedValue.value === "undefined") {
      console.error("[VisualizerService] Invalid SharedValue provided");
      return false;
    }

    // ✅ UPDATE config
    this.config = { ...this.config, ...config };

    // ✅ CLEANUP existing
    this.stopSubscription();
    this.frequencyData = sharedValue;

    // ✅ SETUP new subscription
    if (!visualizerEmitter) {
      console.warn("[VisualizerService] Visualizer emitter not available");
      return false;
    }

    try {
      this.subscription = visualizerEmitter.addListener(
        "onFftData",
        this.handleFftData,
      );
      return true;
    } catch (e) {
      console.error("[VisualizerService] Failed to subscribe:", e);
      return false;
    }
  }

  /**
   * Start visualizer dengan session ID
   */
  async start(sessionId: number = 0): Promise<boolean> {
    // ✅ VALIDASI
    if (!NativeVisualizerBridge) {
      console.warn("[VisualizerService] Native module not available");
      return false;
    }

    if (sessionId === 0) {
      console.warn("[VisualizerService] Invalid session ID: 0");
      return false;
    }

    if (!this.frequencyData) {
      console.warn(
        "[VisualizerService] Not initialized. Call initialize() first",
      );
      return false;
    }

    // ✅ PREVENT double start
    if (this.isStarted && this.lastSessionId === sessionId) {
      console.log("[VisualizerService] Already started for session", sessionId);
      return true;
    }

    // ✅ STOP existing dulu kalau beda session
    if (this.isStarted && this.lastSessionId !== sessionId) {
      this.stopNativeVisualizer();
    }

    this.lastSessionId = sessionId;
    this.isPaused = false;
    this.retryCount = 0;

    return this.doStart(sessionId);
  }

  private async doStart(sessionId: number): Promise<boolean> {
    try {
      const success = await NativeVisualizerBridge!.startVisualizer(sessionId);

      if (success) {
        this.isStarted = true;
        this.retryCount = 0;
        console.log("[VisualizerService] Started for session", sessionId);
        return true;
      } else {
        throw new Error("Native returned false");
      }
    } catch (error) {
      this.isStarted = false;

      // ✅ RETRY LOGIC
      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        console.log(
          `[VisualizerService] Retrying (${this.retryCount}/${this.maxRetries})...`,
        );
        await this.delay(100 * this.retryCount); // Exponential backoff
        return this.doStart(sessionId);
      }

      console.error("[VisualizerService] Start failed after retries:", error);
      return false;
    }
  }

  /**
   * Pause (tanpa unsubscribe) - untuk app state background
   */
  pause(): void {
    if (!this.isStarted || this.isPaused) return;

    this.isPaused = true;
    this.stopNativeVisualizer();
    console.log("[VisualizerService] Paused");
  }

  /**
   * Resume dari pause
   */
  async resume(): Promise<boolean> {
    if (!this.isPaused || this.lastSessionId === 0) {
      return this.isStarted; // Already running or nothing to resume
    }

    const success = await this.doStart(this.lastSessionId);

    if (success) {
      this.isPaused = false;
    }

    return success;
  }

  /**
   * Stop complete - unsubscribe dan release native
   */
  stop(): void {
    console.log("[VisualizerService] Stopping...");

    this.isStarted = false;
    this.isPaused = false;
    this.lastSessionId = 0;
    this.retryCount = 0;
    this.previousData = null;

    this.stopSubscription();
    this.stopNativeVisualizer();

    // Reset shared value ke zeros
    if (this.frequencyData) {
      this.frequencyData.value = new Array(128).fill(0);
    }
  }

  /**
   * Cleanup complete - panggil saat unmount app
   */
  destroy(): void {
    this.stop();
    this.cleanupAppStateListener();
    this.frequencyData = null;
  }

  // ============================================================================
  // Data Processing
  // ============================================================================

  private handleFftData = (data: number[]) => {
    if (!this.frequencyData) return;

    // ✅ VALIDASI data
    if (!Array.isArray(data) || data.length !== 128) {
      console.warn("[VisualizerService] Invalid FFT data:", data?.length);
      return;
    }

    // ✅ SMOOTHING (optional)
    const smoothed = this.applySmoothing(data);

    // ✅ UPDATE via Reanimated (worklet thread)
    // Tidak perlu runOnJS karena SharedValue bisa diakses dari UI thread
    this.frequencyData.value = smoothed;
  };

  private applySmoothing(data: number[]): number[] {
    if (!this.previousData || this.previousData.length !== data.length) {
      this.previousData = [...data];
      return data;
    }

    const { smoothingFactor } = this.config;
    const smoothed = new Array(data.length);

    for (let i = 0; i < data.length; i++) {
      // Exponential moving average
      smoothed[i] =
        this.previousData[i] * (1 - smoothingFactor!) +
        data[i] * smoothingFactor!;
    }

    this.previousData = smoothed;
    return smoothed;
  }

  // ============================================================================
  // Getters
  // ============================================================================

  getStatus(): {
    isStarted: boolean;
    isPaused: boolean;
    sessionId: number;
    isInitialized: boolean;
  } {
    return {
      isStarted: this.isStarted,
      isPaused: this.isPaused,
      sessionId: this.lastSessionId,
      isInitialized: this.frequencyData !== null,
    };
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private stopNativeVisualizer(): void {
    if (NativeVisualizerBridge) {
      try {
        NativeVisualizerBridge.stopVisualizer();
      } catch (e) {
        console.warn("[VisualizerService] Error stopping native:", e);
      }
    }
  }

  private stopSubscription(): void {
    if (this.subscription) {
      try {
        this.subscription.remove();
      } catch (e) {
        console.warn("[VisualizerService] Error removing subscription:", e);
      }
      this.subscription = null;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Export
// ============================================================================

export const visualizerService = new VisualizerService();
export default visualizerService;
