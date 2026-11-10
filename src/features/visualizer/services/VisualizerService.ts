// src/features/visualizer/services/VisualizerService.ts

import {
  AppState,
  AppStateStatus,

  Platform,
} from "react-native";
import type { SharedValue } from "react-native-reanimated";
import NativeVisualizerBridgeSpec from "../../../specs/NativeVisualizerBridge";

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

const NativeVisualizerBridge = NativeVisualizerBridgeSpec as
  | NativeVisualizerBridgeType
  | undefined;

// ============================================================================
// Service Class
// ============================================================================

class VisualizerService {
  // Output targets — MULTI-SUBSCRIBER (2026-11-10).
  //
  // Sebelumnya hanya ada SATU slot (frequencyData ATAU dataCallback): komponen
  // yang terakhir memanggil setDataCallback()/initialize() menang, yang lain
  // berhenti menerima data tanpa pemberitahuan. Tiga layar memakai service
  // ini sekaligus (tab Analyzer + tab Visualizer + SpectogramView di player),
  // jadi satu slot selalu membuat salah satu beku — dan stop() dari satu
  // layar mematikan polling untuk semuanya. Sekarang setiap subscriber
  // terdaftar di Set dan semuanya menerima data yang sama; polling berhenti
  // hanya kalau sudah tidak ada subscriber sama sekali.
  private dataCallbacks = new Set<(data: number[]) => void>();
  private sharedValues = new Set<SharedValue<number[]>>();

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

  /**
   * Berapa kali berturut-turut pembacaan data gagal.
   *
   * Dipakai untuk memisahkan "gagal sekali" dari "gagal terus". Kegagalan
   * sekali wajar (sesi audio baru dibuat, buffer belum terisi); kegagalan
   * terus berarti ada yang salah dan perlu dilaporkan - tapi hanya sekali,
   * karena polling berjalan 20x per detik.
   */
  private consecutiveFailures: number = 0;

  /** Dipanggil sekali saat kegagalan pertama terjadi. Dilihat layar analyzer. */
  private onError: ((error: unknown) => void) | null = null;

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
   * Daftarkan callback penerima FFT data. ADITIF — memanggilnya dari dua
   * komponen TIDAK saling menimpa (beda dengan perilaku lama yang satu
   * slot). Mengembalikan fungsi unsubscribe; panggil saat komponen tidak
   * butuh data lagi (pause/unmount). Bila ada sesi yang tertunda dari
   * start() yang dipanggil sebelum ada subscriber, polling langsung
   * dimulai.
   */
  setDataCallback(
    callback: (data: number[]) => void,
    config?: Partial<VisualizerConfig>,
  ): () => void {
    if (typeof callback !== "function") {
      console.error(
        "[VisualizerService] setDataCallback() requires a function",
      );
      return () => {};
    }
    return this.subscribeDataCallback(callback, config);
  }

  subscribeDataCallback(
    callback: (data: number[]) => void,
    config?: Partial<VisualizerConfig>,
  ): () => void {
    if (config) this.config = { ...this.config, ...config };
    this.dataCallbacks.add(callback);
    this.maybeStartForSubscribers();
    return () => this.unsubscribeDataCallback(callback);
  }

  unsubscribeDataCallback(callback: (data: number[]) => void): void {
    if (this.dataCallbacks.delete(callback)) {
      this.maybeStopWhenIdle();
    }
  }

  /**
   * Daftarkan SharedValue Reanimated sebagai penerima data. Aditif, sama
   * seperti setDataCallback. Mengembalikan unsubscribe. (Tidak ada pemakai
   * saat ini — semua layar memakai setDataCallback — tapi kontraknya tetap
   * dijaga supaya tidak ada yang mengira mode SharedValue sudah mati.)
   */
  initialize(
    sharedValue: SharedValue<number[]>,
    config?: Partial<VisualizerConfig>,
  ): () => void {
    if (!sharedValue || typeof sharedValue.value === "undefined") {
      console.error("[VisualizerService] Invalid SharedValue provided");
      return () => {};
    }
    return this.subscribeSharedValue(sharedValue, config);
  }

  subscribeSharedValue(
    sharedValue: SharedValue<number[]>,
    config?: Partial<VisualizerConfig>,
  ): () => void {
    if (config) this.config = { ...this.config, ...config };
    this.sharedValues.add(sharedValue);
    this.maybeStartForSubscribers();
    return () => this.unsubscribeSharedValue(sharedValue);
  }

  unsubscribeSharedValue(sharedValue: SharedValue<number[]>): void {
    if (this.sharedValues.delete(sharedValue)) {
      this.maybeStopWhenIdle();
    }
  }

  /**
   * Mulai polling untuk subscriber yang baru mendaftar, bila ada sesi yang
   * tertunda dari start() yang dipanggil sebelum ada subscriber. (Hanya
   * pending — sesi yang sudah berjalan dihidupkan lagi lewat start().)
   */
  private maybeStartForSubscribers(): void {
    if (this.isStarted || this.isPaused) return;
    if (this.pendingSessionId <= 0) return;
    const sid = this.pendingSessionId;
    this.pendingSessionId = 0;
    this.doStart(sid).catch(() => {});
  }

  /**
   * Hentikan polling kalau sudah tidak ada subscriber. Dipanggil tiap
   * unsubscribe. Sesi dipertahankan (lastSessionId) supaya subscribe +
   * start berikutnya bisa lanjut tanpa membuat sesi baru.
   */
  private maybeStopWhenIdle(): void {
    if (!this.isStarted) return;
    if (this.dataCallbacks.size > 0 || this.sharedValues.size > 0) return;
    this.isStarted = false;
    this.stopPolling();
    this.stopNativeVisualizer();
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

    // Jika belum ada subscriber, simpan pending session ID — polling
    // dimulai saat subscriber pertama mendaftar (lihat
    // maybeStartForSubscribers).
    if (this.dataCallbacks.size === 0 && this.sharedValues.size === 0) {
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
   * Stop TOTAL (kill-switch global): hentikan polling + native, hapus sesi,
   * kirim array nol ke SEMUA subscriber.
   *
   * JANGAN dipakai untuk lifecycle satu layar — unsubscribe-lah, supaya layar
   * lain yang masih butuh data tidak ikut mati. Dipakai destroy() dan
   * pemakaian lama (useAudioAnalyzer, saat ini mati).
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

    // Kirim nol ke semua subscriber supaya tidak ada yang menampilkan
    // data basi. Subscriber tetap terdaftar — start() berikutnya
    // melanjutkan ke mereka.
    const zeros = new Array(128).fill(0);
    for (const sv of this.sharedValues) {
      sv.value = [...zeros];
    }
    for (const cb of this.dataCallbacks) {
      try {
        cb([...zeros]);
      } catch (_) {}
    }
  }

  /**
   * Cleanup complete
   */
  destroy(): void {
    this.stop();
    this.cleanupAppStateListener();
    this.dataCallbacks.clear();
    this.sharedValues.clear();
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
          this.consecutiveFailures = 0;
        }
      } catch (error) {
        // Native sekarang menolak (reject) saat terjadi kegagalan nyata -
        // sebelumnya ia mengembalikan array kosong sehingga masalahnya tidak
        // terlihat. Log pertama saja, lalu naikkan hitungan supaya kesalahan
        // yang berulang tidak membanjiri log 20x per detik.
        this.consecutiveFailures++;
        if (this.consecutiveFailures === 1) {
          console.warn(
            "[VisualizerService] Gagal membaca data visualizer:",
            error,
          );
          this.onError?.(error);
        }
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

    // Fan-out ke SEMUA subscriber (multi-subscriber, 2026-11-10).
    for (const sv of this.sharedValues) {
      sv.value = smoothed;
    }
    for (const cb of this.dataCallbacks) {
      try {
        cb(smoothed);
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
    subscriberCount: number;
  } {
    return {
      isStarted: this.isStarted,
      isPaused: this.isPaused,
      sessionId: this.lastSessionId,
      isInitialized:
        this.dataCallbacks.size > 0 || this.sharedValues.size > 0,
      subscriberCount: this.dataCallbacks.size + this.sharedValues.size,
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