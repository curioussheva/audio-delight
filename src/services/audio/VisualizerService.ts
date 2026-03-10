import TrackPlayer from 'react-native-track-player';
import { Audio } from 'expo-av';

export interface FrequencyData {
  frequencies: Uint8Array;
  sampleRate: number;
  bandwidth: number;
}

class VisualizerService {
  private analyser: AnalyserNode | null = null;
  private audioContext: AudioContext | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private dataArray: Uint8Array | null = null;
  private animationFrame: number | null = null;
  private listeners: ((data: FrequencyData) => void)[] = [];

  async initialize() {
    if (this.analyser) return;

    try {
      // Buat AudioContext
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Buat AnalyserNode
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.8;
      
      const bufferLength = this.analyser.frequencyBinCount;
      this.dataArray = new Uint8Array(bufferLength);

      // Hubungkan ke TrackPlayer (perlu native module)
      // Untuk MVP, kita gunakan data simulasi
      
      this.startAnimation();
    } catch (error) {
      console.error('Failed to initialize visualizer:', error);
    }
  }

  private startAnimation() {
    const animate = () => {
      if (this.analyser && this.dataArray) {
        this.analyser.getByteFrequencyData(this.dataArray);
        
        this.listeners.forEach(listener => {
          listener({
            frequencies: this.dataArray!,
            sampleRate: this.audioContext?.sampleRate || 44100,
            bandwidth: this.audioContext?.sampleRate / this.analyser!.fftSize || 21.5,
          });
        });
      }
      this.animationFrame = requestAnimationFrame(animate);
    };
    
    this.animationFrame = requestAnimationFrame(animate);
  }

  addListener(callback: (data: FrequencyData) => void) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  destroy() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
    if (this.audioContext) {
      this.audioContext.close();
    }
  }
}

export default new VisualizerService();