// src/features/visualizer/services/VisualizerService.ts
import { NativeModules, NativeEventEmitter } from "react-native";

const { NativeVisualizerBridge } = NativeModules;
const visualizerEmitter = NativeVisualizerBridge ? new NativeEventEmitter(NativeVisualizerBridge) : null;

class VisualizerService {
  private subscription: any = null;

  initialize(callback: (data: number[]) => void): boolean {
    if (!visualizerEmitter) return false;
    
    // Bersihkan listener lama sebelum buat baru
    this.stop(); 

    this.subscription = visualizerEmitter.addListener("onFftData", (data) => {
      if (data && Array.isArray(data)) {
        callback(data);
      }
    });
    return true;
  }

  async start(sessionId: number): Promise<boolean> {
    if (!NativeVisualizerBridge) return false;
    try {
      return await NativeVisualizerBridge.startVisualizer(sessionId);
    } catch (e) {
      console.error("Failed to start visualizer", e);
      return false;
    }
  }

  stop(): void {
    if (this.subscription) {
      this.subscription.remove();
      this.subscription = null;
    }
    if (NativeVisualizerBridge) {
      NativeVisualizerBridge.stopVisualizer();
    }
  }
}

export const visualizerService = new VisualizerService();
 