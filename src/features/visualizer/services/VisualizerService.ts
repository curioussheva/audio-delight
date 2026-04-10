// src/features/visualizer/services/VisualizerService.ts
import { NativeModules, NativeEventEmitter, Platform } from "react-native";

const { NativeVisualizerBridge } = NativeModules;
const visualizerEmitter = NativeVisualizerBridge
  ? new NativeEventEmitter(NativeVisualizerBridge)
  : null;

class VisualizerService {
  private subscription: any = null;

  initialize(callback: (data: number[]) => void): boolean {
    if (!visualizerEmitter) return false;

    this.subscription = visualizerEmitter.addListener("onFftData", callback);
    return true;
  }

  async start(sessionId: number): Promise<boolean> {
    if (!NativeVisualizerBridge) return false;
    try {
      // Session 0 = global audio output (semua app)
      // Session spesifik = hanya audio dari session itu
      return await NativeVisualizerBridge.startVisualizer(sessionId);
    } catch {
      return false;
    }
  }

  stop(): void {
    if (NativeVisualizerBridge) {
      NativeVisualizerBridge.stopVisualizer();
    }
    this.subscription?.remove();
  }
}

export const visualizerService = new VisualizerService();
export default visualizerService;
