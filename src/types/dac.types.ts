export interface DACCapabilities {
  dsdDoP: boolean;
  dsdNative: boolean;
  mqaRenderer: boolean;
  dsd64: boolean;
  dsd128: boolean;
  dsd256: boolean;
  dsd512: boolean;
  pcm192: boolean;
  pcm384: boolean;
  pcm768: boolean;
}

export interface DACInfo {
  id: string;
  name: string;
  manufacturer: string;
  capabilities: DACCapabilities;
  sampleRates: number[];
  bitDepths: number[];
  isNativeDSDSupported: boolean;
}

export interface DACConfig {
  dacId: string;
  exclusiveMode: boolean;
  sampleRate: 'auto' | number;
  bitDepth: 16 | 24 | 32;
  bufferSize: number;
  dsdMode: 'native' | 'dop' | 'off';
  mqaMode: 'renderer' | 'decoder' | 'off';
}

export type AudioOutputMode = 'system' | 'exclusive' | 'direct';