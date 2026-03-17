import { AppState, AppStateStatus, NativeModules, NativeEventEmitter, EmitterSubscription } from 'react-native';
import { SharedValue } from 'react-native-reanimated';

const { NativeVisualizerBridge } = NativeModules;
// Safety: Cek keberadaan modul sebelum membuat Emitter
const visualizerEmitter = NativeVisualizerBridge ? new NativeEventEmitter(NativeVisualizerBridge) : null;

class VisualizerService {
  private frequencyData: SharedValue<number[]> | null = null;
  private subscription: EmitterSubscription | null = null;
  private isStarted: boolean = false;
  private lastSessionId: number = 0;

  constructor() {
    AppState.addEventListener('change', this.handleAppStateChange);
  }

  private handleAppStateChange = async (nextAppState: AppStateStatus) => {
    // Gunakan regex atau check sederhana untuk status tidak aktif
    if (nextAppState.match(/inactive|background/)) {
      this.stopNativeVisualizer();
    } else if (nextAppState === 'active' && this.isStarted && this.lastSessionId !== 0) {
      this.resume();
    }
  };

  private async resume() {
    try {
      if (NativeVisualizerBridge) {
        await NativeVisualizerBridge.startVisualizer(this.lastSessionId);
      }
    } catch (e) {
      console.warn('[VisualizerService] Failed to resume:', e);
    }
  }

  initialize(sharedValue: SharedValue<number[]>) {
    this.frequencyData = sharedValue;
    this.stopSubscription();

    if (visualizerEmitter) {
      this.subscription = visualizerEmitter.addListener('onFftData', (data: number[]) => {
        if (this.frequencyData) {
          // Update ke UI Thread via Reanimated
          this.frequencyData.value = data;
        }
      });
    }
  }

  async start(sessionId: number = 0) {
    if (!NativeVisualizerBridge || sessionId === 0) return;
    
    this.lastSessionId = sessionId;
    this.isStarted = true;

    try {
      await NativeVisualizerBridge.startVisualizer(sessionId);
    } catch (error) {
      this.isStarted = false;
      console.error('[VisualizerService] Start Error:', error);
    }
  }

  stop() {
    this.isStarted = false;
    this.stopSubscription();
    this.stopNativeVisualizer();
  }

  private stopNativeVisualizer() {
    if (NativeVisualizerBridge) {
      NativeVisualizerBridge.stopVisualizer();
    }
  }

  private stopSubscription() {
    this.subscription?.remove();
    this.subscription = null;
  }
}

export default new VisualizerService();
