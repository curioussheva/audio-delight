/**
 * AudioEngine — Singleton
 * Signal chain: Source → EQ Filters[10] → PannerNode(HRTF) → AnalyserNode → GainNode → Destination
 */

import { EQBand, SpatialPosition } from '../types/audio.types';
import { AUDIO_CONFIG, DEFAULT_BANDS } from '../constants/eq';

// --- MOCKING STRATEGY ---
let NativeAudioContext: any = null;
let NativeBiquadFilterNode: any = null;
let NativeGainNode: any = null;
let isNativeAudioAvailable = false;

try {
  // Attempt to require the native module
  const AudioAPI = require('react-native-audio-api');
  NativeAudioContext = AudioAPI.AudioContext;
  NativeBiquadFilterNode = AudioAPI.BiquadFilterNode;
  NativeGainNode = AudioAPI.GainNode;
  isNativeAudioAvailable = true;
} catch (e) {
  console.warn("⚠️ [AudioEngine] Running in Mock Mode: react-native-audio-api not found.");
  
  // Define a dummy AudioContext to prevent runtime crashes
  class MockAudioNode {
    value = 0;
    setTargetAtTime() {}
    connect() {}
  }
  
  NativeAudioContext = class MockAudioContext {
    sampleRate = 44100;
    currentTime = 0;
    destination = new MockAudioNode();
    
    createGain() { 
      return { gain: new MockAudioNode(), connect: () => {} }; 
    }
    createAnalyser() { 
      return { 
        fftSize: 2048, 
        smoothingTimeConstant: 0.8, 
        frequencyBinCount: 1024,
        connect: () => {},
        getByteFrequencyData: () => new Uint8Array(1024),
        getByteTimeDomainData: () => new Uint8Array(2048)
      }; 
    }
    createPanner() {
      return { setPosition: () => {}, panningModel: 'equalpower', connect: () => {} };
    }
    createBiquadFilter() {
      return { 
        type: 'peaking', 
        frequency: new MockAudioNode(), 
        gain: new MockAudioNode(), 
        Q: new MockAudioNode(), 
        connect: () => {} 
      };
    }
    suspend() { return Promise.resolve(); }
    resume() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
  };
}

// We use the resolved NativeAudioContext (either real or mock)
type AudioContextType = typeof NativeAudioContext;

class AudioEngine {
  private static _instance: AudioEngine;

  private ctx: any | null = null; // Using 'any' here due to mock complexity, or cast to AudioContextType
  private eqFilters: any[] = [];
  private panner: any | null = null;        
  private analyser: any | null = null;       
  private masterGain: any | null = null;
  private _isInitialized = false;

  // ─── Singleton ────────────────────────────────────────────────────────────

  static getInstance(): AudioEngine {
    if (!AudioEngine._instance) {
      AudioEngine._instance = new AudioEngine();
    }
    return AudioEngine._instance;
  }

  private constructor() {}

  // ─── Init ─────────────────────────────────────────────────────────────────

  async init(): Promise<void> {
    if (this._isInitialized) return;

    try {
      this.ctx = new NativeAudioContext({
        sampleRate: AUDIO_CONFIG.SAMPLE_RATE,
        latencyHint: AUDIO_CONFIG.LATENCY_HINT,
      });

      // Master gain
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 1.0;

      // Analyser for visualizer
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = AUDIO_CONFIG.FFT_SIZE;
      this.analyser.smoothingTimeConstant = AUDIO_CONFIG.SMOOTHING;

      // Spatial panner with HRTF
      this.panner = this.ctx.createPanner();
      this.panner.panningModel = 'HRTF';
      this.panner.distanceModel = 'inverse';
      this.panner.refDistance = 1;
      this.panner.maxDistance = 10000;
      this.panner.rolloffFactor = 1;
      // Default: centered in front
      this.panner.setPosition(0, 0, -1);

      // Build EQ filter chain
      this.eqFilters = this._buildEQChain(DEFAULT_BANDS);

      // Connect: EQ chain last → Panner → Analyser → Master → Destination
      const lastFilter = this.eqFilters[this.eqFilters.length - 1];
      lastFilter.connect(this.panner);
      this.panner.connect(this.analyser);
      this.analyser.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      this._isInitialized = true;
      console.log(`[AudioEngine] Initialized (${isNativeAudioAvailable ? 'Native' : 'Mock'}). Sample rate:`, this.ctx.sampleRate);
    } catch (err) {
      console.error('[AudioEngine] Init failed:', err);
      throw err;
    }
  }

  // ─── EQ Chain ─────────────────────────────────────────────────────────────

  private _buildEQChain(bands: EQBand[]): any[] {
    const filters = bands.map((band) => {
      const f = this.ctx.createBiquadFilter();
      f.type = band.type;
      f.frequency.value = band.frequency;
      f.gain.value = band.gain;
      f.Q.value = band.q;
      return f;
    });

    // Connect each filter to the next
    for (let i = 1; i < filters.length; i++) {
      filters[i - 1].connect(filters[i]);
    }

    return filters;
  }

  /**
   * Connect an external audio source node to the EQ chain input.
   * Call this after loading a track.
   */
  connectSource(sourceNode: any): void {
    if (!this.eqFilters.length) {
      console.warn('[AudioEngine] connectSource called before init');
      return;
    }
    if (isNativeAudioAvailable) {
       sourceNode.connect(this.eqFilters[0]);
    } else {
       console.log("[AudioEngine] Mock connectSource called");
    }
  }

  // ─── EQ Controls ──────────────────────────────────────────────────────────

  /**
   * Update a single EQ band. Smooth transition (10ms) to avoid clicks.
   */
  setEQBand(index: number, gain: number, freq?: number, q?: number): void {
    const filter = this.eqFilters[index];
    if (!filter || !this.ctx) return;

    const now = this.ctx.currentTime;
    const SMOOTH = 0.01; // 10ms smooth
    
    // Safety check for mock vs native implementation
    if (filter.gain.setTargetAtTime) {
      filter.gain.setTargetAtTime(gain, now, SMOOTH);
      if (freq !== undefined) filter.frequency.setTargetAtTime(freq, now, SMOOTH);
      if (q !== undefined) filter.Q.setTargetAtTime(q, now, SMOOTH);
    } else {
      filter.gain.value = gain;
      if (freq !== undefined) filter.frequency.value = freq;
      if (q !== undefined) filter.Q.value = q;
    }
  }

  /**
   * Apply all bands at once (preset switch).
   */
  applyAllBands(bands: EQBand[]): void {
    bands.forEach((band, i) => {
      this.setEQBand(i, band.gain, band.frequency, band.q);
    });
  }

  // ─── Spatial Controls ─────────────────────────────────────────────────────

  setSpatialPosition(pos: SpatialPosition): void {
    if (this.panner && this.panner.setPosition) {
       this.panner.setPosition(pos.x, pos.y, pos.z);
    }
  }

  setSpatialEnabled(enabled: boolean): void {
    if (!this.panner) return;
    if (enabled) {
      this.panner.panningModel = 'HRTF';
    } else {
      // Disable: center + equalpower (no HRTF overhead)
      this.panner.panningModel = 'equalpower';
      if (this.panner.setPosition) this.panner.setPosition(0, 0, 0);
    }
  }

  // ─── Master Volume ─────────────────────────────────────────────────────────

  setMasterVolume(vol: number): void {
    // vol 0.0 – 1.0
    if (this.masterGain && this.ctx && this.masterGain.gain.setTargetAtTime) {
      this.masterGain.gain.setTargetAtTime(
        Math.max(0, Math.min(1, vol)),
        this.ctx.currentTime,
        0.02
      );
    } else if (this.masterGain) {
      this.masterGain.gain.value = Math.max(0, Math.min(1, vol));
    }
  }

  // ─── Analyser / Visualizer ────────────────────────────────────────────────

  getFFTData(): Uint8Array {
    if (!this.analyser) return new Uint8Array(0);
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    if (this.analyser.getByteFrequencyData) {
       this.analyser.getByteFrequencyData(data);
    }
    return data;
  }

  getWaveformData(): Uint8Array {
    if (!this.analyser) return new Uint8Array(0);
    const data = new Uint8Array(this.analyser.fftSize);
    if (this.analyser.getByteTimeDomainData) {
       this.analyser.getByteTimeDomainData(data);
    }
    return data;
  }

  // ─── State ────────────────────────────────────────────────────────────────

  get isInitialized(): boolean {
    return this._isInitialized;
  }

  get audioContext(): any | null {
    return this.ctx;
  }

  async suspend(): Promise<void> {
    await this.ctx?.suspend?.();
  }

  async resume(): Promise<void> {
    await this.ctx?.resume?.();
  }

  async destroy(): Promise<void> {
    await this.ctx?.close?.();
    this._isInitialized = false;
    this.eqFilters = [];
    this.panner = null;
    this.analyser = null;
    this.masterGain = null;
    this.ctx = null;
  }
}

export default AudioEngine.getInstance();
