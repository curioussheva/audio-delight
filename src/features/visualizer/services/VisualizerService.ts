// src/features/visualizer/services/VisualizerService.ts

import { startVisualizer, stopVisualizer, subscribeToFft, isVisualizerAvailable } from "../native/VisualizerBridge";

class VisualizerService {
  private fftSubscription: (() => void) | null = null;
  private isInitialized = false;
  private currentSessionId: number | null = null;

  initialize(callback: (fftData: number[]) => void): boolean {
    if (!isVisualizerAvailable()) {
      console.warn("[VisualizerService] Visualizer not available on this platform");
      return false;
    }

    this.cleanup();

    try {
      console.log("[VisualizerService] Setting up FFT listener...");

      this.fftSubscription = subscribeToFft((data) => {
        console.log(`[VisualizerService] Received FFT data: ${data.length} bins`);
        callback(data);
      });

      this.isInitialized = true;
      console.log("[VisualizerService] FFT listener attached successfully");
      return true;
    } catch (error) {
      console.error("[VisualizerService] Failed to setup FFT listener:", error);
      return false;
    }
  }

  async start(audioSessionId: number): Promise<boolean> {
    if (!this.isInitialized) {
      console.warn("[VisualizerService] Call initialize() first before start()");
      return false;
    }

    if (audioSessionId <= 0) {
      console.warn(`[VisualizerService] Invalid session ID: ${audioSessionId}`);
      return false;
    }

    try {
      console.log(`[VisualizerService] Starting native visualizer with sessionId: ${audioSessionId}`);
      const success = await startVisualizer(audioSessionId);

      if (success) {
        this.currentSessionId = audioSessionId;
        console.log("[VisualizerService] ✅ Native visualizer started successfully");
      } else {
        console.warn("[VisualizerService] startVisualizer returned false");
      }
      return success;
    } catch (error) {
      console.error("[VisualizerService] Failed to start native visualizer:", error);
      return false;
    }
  }

  stop(): void {
    console.log("[VisualizerService] Stopping visualizer...");
    stopVisualizer();

    if (this.fftSubscription) {
      this.fftSubscription();
      this.fftSubscription = null;
      console.log("[VisualizerService] FFT listener removed");
    }

    this.currentSessionId = null;
  }

  cleanup(): void {
    this.stop();
    this.isInitialized = false;
  }

  isRunning(): boolean {
    return this.currentSessionId !== null;
  }
}

export const visualizerService = new VisualizerService();