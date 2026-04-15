import {
  AppState,
  AppStateStatus,
  NativeModules,
  NativeEventEmitter,
  EmitterSubscription,
  Platform,
} from "react-native";

interface NativeVisualizerBridgeType {
  startVisualizer(audioSessionId: number): Promise<boolean>;
  stopVisualizer(): void;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

interface VisualizerConfig {
  smoothingFactor?: number;
}

const NativeVisualizerBridge = NativeModules.NativeVisualizerBridge as
  | NativeVisualizerBridgeType
  | undefined;

const visualizerEmitter = NativeVisualizerBridge
  ? new NativeEventEmitter(NativeVisualizerBridge as any)
  : null;

class VisualizerService {
  private onFftData: ((data: number[]) => void) | null = null;
  private subscription: EmitterSubscription | null = null;
  private appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;

  private isStarted = false;
  private isPaused = false;
  private lastSessionId = 0;
  private retryCount = 0;
  private readonly maxRetries = 3;
  private previousData: number[] | null = null;
  private config: VisualizerConfig = { smoothingFactor: 0.3 };

  constructor() {
    this.setupAppStateListener();
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  private setupAppStateListener() {
    this.appStateSubscription?.remove();
    this.appStateSubscription = AppState.addEventListener(
      "change",
      this.handleAppStateChange,
    );
  }

  private handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (
      (nextAppState === "inactive" || nextAppState === "background") &&
      this.isStarted && !this.isPaused
    ) {
      this.pause();
    } else if (
      nextAppState === "active" &&
      this.isPaused &&
      this.lastSessionId !== 0
    ) {
      this.resume();
    }
  };

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Initialize dengan callback biasa (bukan SharedValue).
   * Harus dipanggil sebelum start().
   */
  initialize(
    callback: (data: number[]) => void,
    config?: Partial<VisualizerConfig>,
  ): boolean {
    if (typeof callback !== "function") {
      console.error("[VisualizerService] initialize() requires a callback function");
      return false;
    }

    this.config = { ...this.config, ...config };
    this.stopSubscription();
    this.onFftData = callback;
    this.previousData = null;

    if (!visualizerEmitter) {
      console.warn("[VisualizerService] Emitter not available");
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

  async start(sessionId: number = 0): Promise<boolean> {
    if (!NativeVisualizerBridge) return false;
    if (sessionId === 0) {
      console.warn("[VisualizerService] Invalid session ID: 0");
      return false;
    }
    if (!this.onFftData) {
      console.warn("[VisualizerService] Call initialize() before start()");
      return false;
    }
    if (this.isStarted && this.lastSessionId === sessionId) return true;
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
      }
      throw new Error("Native returned false");
    } catch (error) {
      this.isStarted = false;
      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        await this.delay(100 * this.retryCount);
        return this.doStart(sessionId);
      }
      console.error("[VisualizerService] Start failed after retries:", error);
      return false;
    }
  }

  pause(): void {
    if (!this.isStarted || this.isPaused) return;
    this.isPaused = true;
    this.stopNativeVisualizer();
  }

  async resume(): Promise<boolean> {
    if (!this.isPaused || this.lastSessionId === 0) return this.isStarted;
    const success = await this.doStart(this.lastSessionId);
    if (success) this.isPaused = false;
    return success;
  }

  stop(): void {
    this.isStarted = false;
    this.isPaused = false;
    this.lastSessionId = 0;
    this.retryCount = 0;
    this.previousData = null;
    this.stopSubscription();
    this.stopNativeVisualizer();
  }

  destroy(): void {
    this.stop();
    this.appStateSubscription?.remove();
    this.appStateSubscription = null;
    this.onFftData = null;
  }

  // ── Data Processing ────────────────────────────────────────────────────────

  private handleFftData = (data: number[]) => {
    if (!this.onFftData) return;
    if (!Array.isArray(data) || data.length !== 128) {
      console.warn("[VisualizerService] Invalid FFT data length:", data?.length);
      return;
    }

    const smoothed = this.applySmoothing(data);
    this.onFftData(smoothed);
  };

  private applySmoothing(data: number[]): number[] {
    const { smoothingFactor = 0.3 } = this.config;
    if (!this.previousData || this.previousData.length !== data.length) {
      this.previousData = [...data];
      return data;
    }
    const smoothed = data.map(
      (v, i) => this.previousData![i] * (1 - smoothingFactor) + v * smoothingFactor,
    );
    this.previousData = smoothed;
    return smoothed;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  getStatus() {
    return {
      isStarted: this.isStarted,
      isPaused: this.isPaused,
      sessionId: this.lastSessionId,
      isInitialized: this.onFftData !== null,
    };
  }

  private stopNativeVisualizer(): void {
    try { NativeVisualizerBridge?.stopVisualizer(); } catch (_) {}
  }

  private stopSubscription(): void {
    try { this.subscription?.remove(); } catch (_) {}
    this.subscription = null;
  }

  private delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
}

export const visualizerService = new VisualizerService();
export default visualizerService; 