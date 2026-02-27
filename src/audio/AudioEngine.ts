/**
 * AudioEngine — Singleton
 * Mock mode otomatis aktif jika react-native-audio-api tidak tersedia (Expo Go).
 * Real mode aktif saat dev build dengan native module.
 */

import { EQBand, SpatialPosition } from '../types/audio.types';
import { AUDIO_CONFIG, DEFAULT_BANDS } from '../constants/eq';

// ─── Mock FFT generator untuk visualizer saat mock mode ──────────────────────
function generateMockFFT(bins: number): Uint8Array {
  const data = new Uint8Array(bins);
  const t = Date.now() / 1000;
  for (let i = 0; i < bins; i++) {
    const freq = i / bins;
    data[i] = Math.floor(
      (Math.sin(t * 2 + i * 0.3) * 0.3 + 0.4 + Math.random() * 0.1) *
      Math.exp(-freq * 2) * 200
    );
  }
  return data;
}

class AudioEngine {
  private static _instance: AudioEngine;

  private ctx: any = null;
  private eqFilters: any[] = [];
  private panner: any = null;
  private analyser: any = null;
  private masterGain: any = null;
  private _isInitialized = false;
  private _isMockMode = false;

  static getInstance(): AudioEngine {
    if (!AudioEngine._instance) AudioEngine._instance = new AudioEngine();
    return AudioEngine._instance;
  }
  private constructor() {}

  async init(): Promise<void> {
    if (this._isInitialized) return;
    try {
      const { AudioContext } = require('react-native-audio-api');
      this.ctx = new AudioContext({
        sampleRate: AUDIO_CONFIG.SAMPLE_RATE,
        latencyHint: AUDIO_CONFIG.LATENCY_HINT,
      });
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 1.0;
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = AUDIO_CONFIG.FFT_SIZE;
      this.analyser.smoothingTimeConstant = AUDIO_CONFIG.SMOOTHING;
      this.panner = this.ctx.createPanner();
      this.panner.panningModel = 'HRTF';
      this.panner.distanceModel = 'inverse';
      this.panner.setPosition(0, 0, -1);
      this.eqFilters = this._buildEQChain(DEFAULT_BANDS);
      const last = this.eqFilters[this.eqFilters.length - 1];
      last.connect(this.panner);
      this.panner.connect(this.analyser);
      this.analyser.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
      this._isInitialized = true;
      this._isMockMode = false;
      console.log('[AudioEngine] ✅ Real mode initialized');
    } catch (e) {
      // Fallback ke mock mode (Expo Go, emulator, dll)
      this._isMockMode = true;
      this._isInitialized = true;
      console.warn('[AudioEngine] ⚠️ Running in Mock Mode: react-native-audio-api not found.');
      console.warn('[AudioEngine] Audio processing disabled. Build dev build untuk full features.');
    }
  }

  private _buildEQChain(bands: EQBand[]): any[] {
    if (!this.ctx || this._isMockMode) return [];
    const filters = bands.map((band) => {
      const f = this.ctx.createBiquadFilter();
      f.type = band.type;
      f.frequency.value = band.frequency;
      f.gain.value = band.gain;
      f.Q.value = band.q;
      return f;
    });
    for (let i = 1; i < filters.length; i++) filters[i - 1].connect(filters[i]);
    return filters;
  }

  connectSource(sourceNode: any): void {
    if (this._isMockMode || !this.eqFilters.length) return;
    sourceNode.connect(this.eqFilters[0]);
  }

  setEQBand(index: number, gain: number, freq?: number, q?: number): void {
    if (this._isMockMode) return;
    const filter = this.eqFilters[index];
    if (!filter || !this.ctx) return;
    const now = this.ctx.currentTime;
    filter.gain.setTargetAtTime(gain, now, 0.01);
    if (freq !== undefined) filter.frequency.setTargetAtTime(freq, now, 0.01);
    if (q !== undefined) filter.Q.setTargetAtTime(q, now, 0.01);
  }

  applyAllBands(bands: EQBand[]): void {
    bands.forEach((band, i) => this.setEQBand(i, band.gain, band.frequency, band.q));
  }

  setSpatialPosition(pos: SpatialPosition): void {
    if (this._isMockMode) return;
    this.panner?.setPosition(pos.x, pos.y, pos.z);
  }

  setSpatialEnabled(enabled: boolean): void {
    if (this._isMockMode || !this.panner) return;
    this.panner.panningModel = enabled ? 'HRTF' : 'equalpower';
    if (!enabled) this.panner.setPosition(0, 0, 0);
  }

  setMasterVolume(vol: number): void {
    if (this._isMockMode || !this.masterGain || !this.ctx) return;
    this.masterGain.gain.setTargetAtTime(Math.max(0, Math.min(1, vol)), this.ctx.currentTime, 0.02);
  }

  getFFTData(): Uint8Array {
    if (this._isMockMode) return generateMockFFT(AUDIO_CONFIG.FFT_SIZE / 2);
    if (!this.analyser) return new Uint8Array(0);
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    return data;
  }

  getWaveformData(): Uint8Array {
    if (this._isMockMode) return generateMockFFT(AUDIO_CONFIG.FFT_SIZE);
    if (!this.analyser) return new Uint8Array(0);
    const data = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(data);
    return data;
  }

  get isInitialized(): boolean { return this._isInitialized; }
  get isMockMode(): boolean { return this._isMockMode; }
  get audioContext(): any { return this.ctx; }
}

export default AudioEngine.getInstance();
