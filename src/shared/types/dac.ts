// ============================================================================
// DSD Support Levels
// ============================================================================

export type DSDRate = 64 | 128 | 256 | 512 | 1024;

export interface DSDCapabilities {
  dop: boolean; // DSD over PCM
  native: boolean; // True native DSD
  supportedRates: DSDRate[]; // [64, 128, 256] etc.
}

// ============================================================================
// PCM Capabilities
// ============================================================================

export interface PCMCapabilities {
  maxSampleRate: number; // 768000, 384000, 192000, etc.
  maxBitDepth: number; // 32, 24, 16
  supportedRates: number[]; // [44100, 48000, 96000, ...]
  supportedBitDepths: number[]; // [16, 24, 32]
}

// ============================================================================
// Complete DAC Capabilities
// ============================================================================

export interface DACCapabilities {
  pcm: PCMCapabilities;
  dsd: DSDCapabilities;
  mqa: {
    supported: boolean;
    renderer: boolean;
    decoder: boolean;
    fullDecoder: boolean;
  };
  channelCount: number; // 1, 2, or more (multichannel DAC)
}

// ============================================================================
// DAC Hardware Info (from USB Descriptor / Android AudioDeviceInfo)
// ============================================================================

export interface DACHardwareInfo {
  id: string; // Android AudioDeviceInfo ID
  productId: string; // USB product ID
  vendorId: string; // USB vendor ID

  // Naming
  productName: string; // Device name from USB descriptor
  manufacturer: string; // Manufacturer name

  // Connection
  connectionType: "usb" | "bluetooth" | "hdmi" | "builtin";
  isExternal: boolean; // true untuk USB/BT/HDMI, false untuk builtin

  // Android-specific
  audioDeviceType: number; // AudioDeviceInfo.TYPE_USB_DEVICE, etc.
}

// ============================================================================
// Complete DAC Info (Hardware + Capabilities)
// ============================================================================

export interface DACInfo {
  hardware: DACHardwareInfo;
  capabilities: DACCapabilities;

  // Runtime info (from Android)
  currentSampleRate?: number; // Currently playing sample rate
  currentBitDepth?: number; // Currently playing bit depth
  isConnected: boolean; // Real-time status
}

// ============================================================================
// DAC Configuration (User Settings)
// ============================================================================

export type DSDMode = "native" | "dop" | "off";
export type MqAMode = "renderer" | "decoder" | "off";
export type VolumeControlMode = "hardware" | "software" | "none";

export interface DACConfig {
  // Target DAC
  dacId: string;

  // Output Mode
  exclusiveMode: boolean; // true = bypass Android mixer

  // Audio Format
  sampleRate: "auto" | number; // "auto" = match source, atau force specific
  bitDepth: 16 | 24 | 32;
  bufferSize: number; // in samples (256, 512, 1024, 2048)

  // DSD Handling
  dsdMode: DSDMode;

  // MQA Handling
  mqaMode: MqAMode;

  // Volume
  volumeControl: VolumeControlMode;
  hardwareVolumeSteps?: number; // Jika hardware volume (0-100 atau 0-127)
}

// ============================================================================
// Audio Output / Routing
// ============================================================================

export type AudioOutputType = "builtin" | "usb" | "bluetooth" | "hdmi" | "line";

export interface AudioOutput {
  id: string;
  name: string;
  type: AudioOutputType;

  // Status
  isAvailable: boolean; // Device connected/paired
  isSelected: boolean; // Currently active output

  // Capabilities (simplified untuk UI)
  maxSampleRate: number;
  maxBitDepth: number;
  supportsDSD: boolean;

  // Reference ke DACInfo lengkap (jika external DAC)
  dacInfo?: DACInfo;
}

// ============================================================================
// Audio Route (Complete Routing Configuration)
// ============================================================================

export interface AudioRoute {
  // Source
  sourceSampleRate: number; // Original file sample rate
  sourceBitDepth: number; // Original file bit depth
  sourceFormat: "pcm" | "dsd" | "mqa"; // Source type

  // Processing
  outputMode: "system" | "exclusive" | "direct"; // System = Android mixer

  // Target
  output: AudioOutput;

  // Actual Output (computed/set by system)
  actualSampleRate: number; // May differ from source (resampling)
  actualBitDepth: number;
  isBitPerfect: boolean; // true jika no resampling/processing
}

// ============================================================================
// DAC Runtime State (untuk UI/Store)
// ============================================================================

export interface DACState {
  // Connected Devices
  connectedDACs: DACInfo[];
  selectedDAC: DACInfo | null;

  // Configuration
  config: DACConfig | null;

  // Runtime Status
  isExclusiveModeActive: boolean;
  currentAudioRoute: AudioRoute | null;

  // Volume
  currentVolume: number; // 0.0 - 1.0
  hardwareVolume?: number; // Raw hardware volume jika available

  // Errors
  lastError: string | null;
}

// ============================================================================
// Events / Callbacks
// ============================================================================

export type DACEventType =
  | "connected"
  | "disconnected"
  | "selected"
  | "configChanged"
  | "error";

export interface DACEvent {
  type: DACEventType;
  dacId: string;
  timestamp: number;
  data?: any;
}

// ============================================================================
// Utility Type Guards
// ============================================================================

export const isDSDCapable = (dac: DACInfo): boolean => {
  return dac.capabilities.dsd.native || dac.capabilities.dsd.dop;
};

export const getMaxDSDRate = (dac: DACInfo): DSDRate | null => {
  const rates = dac.capabilities.dsd.supportedRates;
  return rates.length > 0 ? (Math.max(...rates) as DSDRate) : null;
};

export const isHiResCapable = (dac: DACInfo): boolean => {
  const pcm = dac.capabilities.pcm;
  return pcm.maxSampleRate > 48000 || pcm.maxBitDepth > 16;
};

export const canDoBitPerfect = (
  dac: DACInfo,
  sourceSampleRate: number,
  sourceBitDepth: number,
): boolean => {
  const pcm = dac.capabilities.pcm;
  return (
    pcm.supportedRates.includes(sourceSampleRate) &&
    pcm.supportedBitDepths.includes(sourceBitDepth)
  );
};

export const recommendDSDMode = (
  dac: DACInfo,
  sourceDSDRate: DSDRate,
): DSDMode => {
  const dsd = dac.capabilities.dsd;

  if (dsd.native && dsd.supportedRates.includes(sourceDSDRate)) {
    return "native";
  }
  if (dsd.dop) {
    return "dop";
  }
  return "off"; // Convert to PCM
};
