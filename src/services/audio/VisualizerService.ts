import { AppState, AppStateStatus, NativeModules, NativeEventEmitter, EmitterSubscription } from 'react-native';
import { SharedValue } from 'react-native-reanimated';

const { NativeVisualizerBridge } = NativeModules;
const visualizerEmitter = new NativeEventEmitter(NativeVisualizerBridge);

class VisualizerService {
  private frequencyData: SharedValue<number[]> | null = null;
  private subscription: EmitterSubscription | null = null;
  private isStarted: boolean = false;
  private lastSessionId: number = 0; // Menyimpan ID terakhir untuk resume

  constructor() {
    // Listener untuk menangani siklus hidup aplikasi (Background/Foreground)
    AppState.addEventListener('change', this.handleAppStateChange);
  }

  private handleAppStateChange = async (nextAppState: AppStateStatus) => {
    if (nextAppState === 'background' || nextAppState === 'inactive') {
      // Hentikan pemrosesan native saat tidak terlihat untuk menghemat CPU/Baterai
      this.stopNativeVisualizer();
    } else if (nextAppState === 'active' && this.isStarted) {
      // Otomatis jalan lagi saat app dibuka kembali
      try {
        await NativeVisualizerBridge.startVisualizer(this.lastSessionId);
      } catch (e) {
        console.warn('[VisualizerService] Failed to resume visualizer:', e);
      }
    }
  };

  /**
   * Menghubungkan SharedValue ke stream data FFT Native
   */
  initialize(sharedValue: SharedValue<number[]>) {
    this.frequencyData = sharedValue;
    
    // Pastikan tidak ada duplikasi listener
    this.stopSubscription();

    this.subscription = visualizerEmitter.addListener('onFftData', (data: number[]) => {
      if (this.frequencyData) {
        // Update langsung ke UI Thread tanpa melewati Bridge JS berulang kali
        this.frequencyData.value = data;
      }
    });
  }

  /**
   * Memulai penangkapan data audio
   */
  async start(sessionId: number = 0) {
    if (!NativeVisualizerBridge) {
      console.error('[VisualizerService] NativeVisualizerBridge is null');
      return;
    }
    
    this.lastSessionId = sessionId;
    this.isStarted = true;

    try {
      await NativeVisualizerBridge.startVisualizer(sessionId);
    } catch (error) {
      this.isStarted = false;
      console.error('[VisualizerService] Start Error:', error);
    }
  }

  /**
   * Menghentikan total visualizer (saat pindah layar atau stop musik)
   */
  stop() {
    this.isStarted = false;
    this.stopSubscription();
    this.stopNativeVisualizer();
  }

  private stopNativeVisualizer() {
    if (NativeVisualizerBridge) {
      try {
        NativeVisualizerBridge.stopVisualizer();
      } catch (e) {
        // Seringkali gagal jika sudah berhenti, kita abaikan
      }
    }
  }

  private stopSubscription() {
    if (this.subscription) {
      this.subscription.remove();
      this.subscription = null;
    }
  }
}

// Export sebagai Singleton agar state isStarted konsisten di seluruh aplikasi
export default new VisualizerService();
