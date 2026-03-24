export interface EqualizerBand {
  frequency: number;
  gain: number;
  q?: number;
  type?: "peaking" | "lowshelf" | "highshelf";
}

export interface FrequencyData {
  frequencies: Float32Array;
  sampleRate: number;
  bins: number;
}

export interface DACInfo {
  id: string;
  name: string;
  manufacturer: string;
  deviceClass: string;
  sampleRates?: number[];
  bitDepths?: number[];
}
