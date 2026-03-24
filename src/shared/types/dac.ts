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
  dsd1024?: boolean;
}

export interface DACInfo {
  id: string;
  name: string;
  manufacturer: string;
  productName?: string;
  capabilities: DACCapabilities;
  sampleRates: number[];
  bitDepths: number[];
  channelCount: number;
  isNativeDSDSupported: boolean;
  isUSB: boolean;
  isBluetooth: boolean;
}

export interface DACConfig {
  dacId: string;
  exclusiveMode: boolean;
  sampleRate: "auto" | number;
  bitDepth: 16 | 24 | 32;
  bufferSize: number; // in samples
  dsdMode: "native" | "dop" | "off";
  mqaMode: "renderer" | "decoder" | "off";
  volumeControl: "hardware" | "software" | "none";
}

export type AudioOutputMode = "system" | "exclusive" | "direct";

export interface AudioRoute {
  id: string;
  name: string;
  type: "builtin" | "usb" | "bluetooth" | "hdmi";
  isDefault: boolean;
  isSelected: boolean;
  sampleRates: number[];
}
