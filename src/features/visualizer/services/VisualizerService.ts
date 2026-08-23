// src/features/visualizer/services/VisualizerService.ts

import {
  AppState,
  AppStateStatus,
  NativeModules,
  Platform,
} from "react-native";
import type { SharedValue } from "react-native-reanimated";

// ============================================================================
// Types
// ============================================================================

interface NativeVisualizerBridgeType {
  startVisualizer(audioSessionId: number): Promise<boolean>;
  stopVisualizer(): void;
  getFFTData(): Promise<number[]>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

interface VisualizerConfig {
  smoothingFactor?: number; // 0-1, default 0.3
  minDecibels?: number;     // informational, tidak dipakai native saat ini
  maxDecibels?: number;     // informational
  pollingIntervalMs?: number; // default 50
}

// ============================================================================
// Module Resolution
// ============================================================================

const NativeVisualizerBridge = NativeModules.NativeVisualizerBridge as
  | NativeVisualizerBridgeType
  | undefined;

// ============================================================================
// Service Class
// ============================================================================

class VisualizerService {
  // Output targets
  private frequencyData: SharedValue<number[]> | null = null;
  private dataCallback: ((data: number[]) => void) | null = null;

  private appStateSubscription: ReturnType<
    typeof AppState.addEventListener
  > | null = null;

  private pollingTimer: ReturnType<typeof setInterval> | null = null;

  // Status
  private isStarted: boolean = false;
  private isPaused: boolean = false;
  private lastSessionId: number = 0;
  private pendingSessionId: number = 0; // dipakai saat start() dipanggil sebelum target diset
  private retryCount: number = 0;
  private readonly maxRetries = 3;

  // Config
  private config: VisualizerConfig = {
    smoothingFactor: 0.3,
    minDecibels: -100,
    maxDecibels: -30,
    pollingIntervalMs: 50,
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
    this.cleanupAppStateListener();
    this.appStateSubscription = AppState.addEventListener(
      "change",
      this.handleAppStateChange,
    );
  }

  private cleanupAppStateListener() {
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
  }

  private handleAppStateChange = (nextAppState: AppStateStatus) => {
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
  // Public API — Setup output target
  // ============================================================================

  /**
   * Set callback untuk menerima FFT data.
   * Bisa dipanggil sebelum start().
   */
  setDataCallback(
    callback: (data: number[]) => void,
    config?: Partial<VisualizerConfig>,
  ): void {
    if (typeof callback !== "function") {
      console.error(
        "[VisualizerService] setDataCallback() requires a function",
      );
      return;
    }
    if (config) this.config = { ...this.config, ...config };
    this.dataCallback = callback;
    this.frequencyData = null; // pilih mode callback
    this.previousData = null;

    if (this.pendingSessionId > 0 && !this.isStarted) {
      const sid = this.pendingSessionId;
      this.pendingSessionId = 0;
      this.doStart(sid).catch(() => {});
    }
  }

  /**
   * Inisialisasi dengan SharedValue dari Reanimated.
   * Harus dipanggil sebelum start() jika ingin update shared value.
   */
  initialize(
    sharedValue: SharedValue<number[]>,
    config?: Partial<VisualizerConfig>,
  ): boolean {
    if (!sharedValue || typeof sharedValue.value === "undefined") {
      console.error("[VisualizerService] Invalid SharedValue provided");
      return false;
    }

    if (config) this.config = { ...this.config, ...config };
    this.frequencyData = sharedValue;
    this.dataCallback = null; // pilih mode shared value
    this.previousData = null;

    if (this.pendingSessionId > 0 && !this.isStarted) {
      const sid = this.pendingSessionId;
      this.pendingSessionId = 0;
      this.doStart(sid).catch(() => {});
    }

    return true;
  }

  // ============================================================================
  // Public API — Start/Stop
  // ============================================================================

  /**
   * Start visualizer dengan session ID.
   * Aman dipanggil sebelum setDataCallback()/initialize() — akan di-queue.
   */
  async start(sessionId: number = 0): Promise<boolean> {
    if (!NativeVisualizerBridge) {
      console.warn("[VisualizerService] Native module not available");
      return false;
    }

    if (sessionId <= 0) {
      console.warn("[VisualizerService] Invalid session ID:", sessionId);
      return false;
    }

    if (this.isStarted && this.lastSessionId === sessionId) {
      return true;
    }

    if (this.isStarted && this.lastSessionId !== sessionId) {
      this.stopNativeVisualizer();
      this.isStarted = false;
    }

    this.lastSessionId = sessionId;
    this.isPaused = false;
    this.retryCount = 0;

    // Jika belum ada target output, simpan pending session ID
    if (!this.dataCallback && !this.frequencyData) {
      console.log(
        "[VisualizerService] Output target not set yet, queuing session",
        sessionId,
      );
      this.pendingSessionId = sessionId;
      return false;
    }

    return this.doStart(sessionId);
  }

  private async doStart(sessionId: number): Promise<boolean> {
    try {
      const success = await NativeVisualizerBridge!.startVisualizer(sessionId);
      if (success) {
        this.isStarted = true;
        this.retryCount = 0;
        this.lastSessionId = sessionId;
        this.startPolling();
        console.log("[VisualizerService] Started for session", sessionId);
        return true;
      }
      throw new Error("Native returned false");
    } catch (error) {
      this.isStarted = false;

      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        console.log(
          `[VisualizerService] Retrying (${this.retryCount}/${this.maxRetries})...`,
        );
        await this.delay(100 * this.retryCount);
        return this.doStart(sessionId);
      }

      console.error("[VisualizerService] Start failed after retries:", error);
      return false;
    }
  }

  /**
   * Pause (stop native, tapi jangan hancurkan state)
   */
  pause(): void {
    if (!this.isStarted || this.isPaused) return;

    this.isPaused = true;
    this.isStarted = false;
    this.stopPolling();
    this.stopNativeVisualizer();
    console.log("[VisualizerService] Paused");
  }

  /**
   * Resume dari pause
   */
  async resume(): Promise<boolean> {
    if (!this.isPaused || this.lastSessionId === 0) {
      return this.isStarted;
    }

    const success = await this.doStart(this.lastSessionId);
    if (success) {
      this.isPaused = false;
    }
    return success;
  }

  /**
   * Stop complete
   */
  stop(): void {
    console.log("[VisualizerService] Stopping...");

    this.isStarted = false;
    this.isPaused = false;
    this.lastSessionId = 0;
    this.pendingSessionId = 0;
    this.retryCount = 0;
    this.previousData = null;

    this.stopPolling();
    this.stopNativeVisualizer();

    // Reset output target
    if (this.frequencyData) {
      this.frequencyData.value = new Array(128).fill(0);
    } else if (this.dataCallback) {
      try {
        this.dataCallback(new Array(128).fill(0));
      } catch (_) {}
    }
  }

  /**
   * Cleanup complete
   */
  destroy(): void {
    this.stop();
    this.cleanupAppStateListener();
    this.frequencyData = null;
    this.dataCallback = null;
  }

  // ============================================================================
  // Polling Engine
  // ============================================================================

  private startPolling(): void {
    if (this.pollingTimer) return;

    const intervalMs = this.config.pollingIntervalMs ?? 50;
    this.pollingTimer = setInterval(async () => {
      if (!this.isStarted) return;

      try {
        const data = await NativeVisualizerBridge?.getFFTData();
        if (data && Array.isArray(data)) {
          this.handleFftData(data);
        }
      } catch (error) {
        // Jangan spam log
      }
    }, intervalMs);
  }

  private stopPolling(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  // ============================================================================
  // Data Processing
  // ============================================================================

  private handleFftData = (data: number[]) => {
    if (!this.isStarted) return;

    if (!Array.isArray(data) || data.length !== 128) {
      console.warn("[VisualizerService] Invalid FFT data:", data?.length);
      return;
    }

    const smoothed = this.applySmoothing(data);

    // Update sesuai mode
    if (this.frequencyData) {
      this.frequencyData.value = smoothed;
    } else if (this.dataCallback) {
      try {
        this.dataCallback(smoothed);
      } catch (e) {
        console.error("[VisualizerService] Data callback error:", e);
      }
    }
  };

  private applySmoothing(data: number[]): number[] {
    if (!this.previousData || this.previousData.length !== data.length) {
      this.previousData = [...data];
      return data;
    }

    const { smoothingFactor = 0.3 } = this.config;
    const smoothed = new Array(data.length);

    for (let i = 0; i < data.length; i++) {
      smoothed[i] =
        this.previousData[i] * (1 - smoothingFactor) +
        data[i] * smoothingFactor;
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
      isInitialized: this.dataCallback !== null || this.frequencyData !== null,
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

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Export
// ============================================================================

export const visualizerService = new VisualizerService();
export default visualizerService;