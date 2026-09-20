/**
 * Audio Config — Centralized settings untuk PristineAudio.
 *
 * ⚠️ STATUS: Sebagian config masih hardcoded di C++.
 * Config di sini = dokumentasi + persiapan v1.1 (live tuning via JS).
 *
 * Untuk apply runtime, butuh JNI setter:
 *   NativePlaybackService.setConfig(key, value)
 * (belum diimplementasi — masuk backlog F1)
 *
 * Mapping config → C++ file:
 * ┌────────────────────┬──────────────────────────────┐
 * │ filterSize         │ FFmpegDecoder.cpp            │
 * │ queue.capacity     │ PlaybackController.cpp       │
 * │ flowControl        │ PlaybackController.cpp       │
 * │ gain.headroom      │ FFmpegDecoder.cpp            │
 * │ resampler          │ FFmpegDecoder.cpp            │
 * │ sampleRate         │ AudioConstants.h + Decoder   │
 * │ oboe               │ AudioStreamController.cpp    │
 * │ decoder            │ DecoderWorker.cpp            │
 * └────────────────────┴──────────────────────────────┘
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

// ============================================================
// STORAGE KEYS
// ============================================================

const STORAGE_KEY = "audio_config_v1";
const PRESET_KEY = "audio_preset_v1";

// ============================================================
// TYPES
// ============================================================

export type AudioQualityPreset =
  | "high"
  | "balanced"
  | "performance"
  | "battery_saver";

export type SampleRateMode = "fixed" | "auto" | "device";

export type OboePerformanceMode =
  | "low_latency"
  | "none"
  | "power_saving";

export type OboeSharingMode = "exclusive" | "shared";

export type OboeApi = "auto" | "aaudio" | "opensl";

// ============================================================
// CONFIG SHAPE
// ============================================================

export interface AudioConfigShape {
  /** Resampler quality (CPU vs aliasing) */
  filterSize: {
    /** Untuk file ≤ 48kHz (default: 128) */
    low: number;
    /** Untuk file > 48kHz (default: 64) */
    high: number;
  };

  /** PCM queue buffer */
  queue: {
    /** Wajib power of 2. Default: 1<<21 (21.8s) */
    capacityFrames: number;
  };

  /** Decoder flow control */
  flowControl: {
    /** Pause decoder saat queue > X% (default: 80) */
    pauseThreshold: number;
    /** Resume decoder saat queue < X% (default: 40) */
    resumeThreshold: number;
  };

  /** Output volume safety */
  gain: {
    /** Headroom multiplier 0.0-1.0 (default: 0.89 / -1 dB) */
    headroom: number;
  };

  /** Resampler fine-tuning */
  resampler: {
    /** Roll-off point 0.90-1.0 (default: 0.97) */
    cutoff: number;
    /** Dither strength 0.0-1.0 (default: 0.5) */
    ditherScale: number;
  };

  /** Sample rate conversion */
  sampleRate: {
    /** Target Hz: 44100 / 48000 / 96000 (default: 48000) */
    target: number;
    /** Mode: fixed (all resample) / auto (per-track) / device (native) */
    mode: SampleRateMode;
  };

  /** Oboe audio stream */
  oboe: {
    /** Frames per callback: 0=auto, else 96-960 (default: 0) */
    framesPerBurst: number;
    /** Performance mode (default: low_latency) */
    perfMode: OboePerformanceMode;
    /** Sharing mode (default: exclusive) */
    sharingMode: OboeSharingMode;
    /** Audio API (default: auto = AAudio fallback OpenSL) */
    api: OboeApi;
  };

  /** Decoder worker */
  decoder: {
    /** Frames per decode call (default: 4608) */
    chunkSize: number;
    /** Gapless playback (default: true) */
    gapless: boolean;
    /** Skip leading/trailing silence (default: false) */
    skipSilence: boolean;
  };

  /** Experimental features */
  experimental: {
    /** Preload next track (default: false) */
    preloadNextTrack: boolean;
    /** Per-track sample rate switching (default: false) */
    sampleRateSwitch: boolean;
  };
}

// ============================================================
// DEFAULT CONFIG
// ============================================================

export const DEFAULT_AUDIO_CONFIG: AudioConfigShape = {
  filterSize: {
    low: 128,   // ≤48k: quality
    high: 64,   // >48k: CPU light
  },
  queue: {
    capacityFrames: 1 << 21,  // 524288 frames = ~21.8s stereo @ 48k
  },
  flowControl: {
    pauseThreshold: 80,
    resumeThreshold: 40,
  },
  gain: {
    headroom: 0.89,  // -1 dB
  },
  resampler: {
    cutoff: 0.97,
    ditherScale: 0.5,
  },
  sampleRate: {
    target: 48000,
    mode: "fixed",
  },
  oboe: {
    framesPerBurst: 0,  // auto
    perfMode: "low_latency",
    sharingMode: "exclusive",
    api: "auto",
  },
  decoder: {
    chunkSize: 4608,
    gapless: true,
    skipSilence: false,
  },
  experimental: {
    preloadNextTrack: false,
    sampleRateSwitch: false,
  },
};

// ============================================================
// PRESETS
// ============================================================

export const AUDIO_PRESETS: Record<AudioQualityPreset, AudioConfigShape> = {
  /**
   * HIGH — Quality maksimal, CPU heavy.
   * Untuk: flagship phone, IEM bagus, USB DAC.
   */
  high: {
    ...DEFAULT_AUDIO_CONFIG,
    filterSize: { low: 128, high: 128 },
    resampler: { cutoff: 0.97, ditherScale: 1.0 },
  },

  /**
   * BALANCED — Recommended default.
   * Untuk: mid-range phone, mayoritas use case.
   */
  balanced: {
    ...DEFAULT_AUDIO_CONFIG,
    filterSize: { low: 128, high: 64 },
    resampler: { cutoff: 0.97, ditherScale: 0.5 },
  },

  /**
   * PERFORMANCE — CPU hemat.
   * Untuk: phone lama, multitasking, battery moderate.
   */
  performance: {
    ...DEFAULT_AUDIO_CONFIG,
    filterSize: { low: 64, high: 32 },
    queue: { capacityFrames: 1 << 20 },  // 10.9s
    flowControl: { pauseThreshold: 75, resumeThreshold: 45 },
    resampler: { cutoff: 0.95, ditherScale: 0.5 },
  },

  /**
   * BATTERY_SAVER — Extreme CPU saving.
   * Untuk: battery <20%, long playback.
   */
  battery_saver: {
    ...DEFAULT_AUDIO_CONFIG,
    filterSize: { low: 32, high: 16 },
    queue: { capacityFrames: 1 << 20 },
    flowControl: { pauseThreshold: 75, resumeThreshold: 45 },
    resampler: { cutoff: 0.95, ditherScale: 0.0 },
    oboe: {
      ...DEFAULT_AUDIO_CONFIG.oboe,
      perfMode: "power_saving",
    },
  },
};

// ============================================================
// PRESET DESCRIPTIONS (untuk UI)
// ============================================================

export const PRESET_LABELS: Record<AudioQualityPreset, {
  name: string;
  description: string;
  cpu: "low" | "medium" | "high";
  quality: "low" | "medium" | "high";
}> = {
  high: {
    name: "High Quality",
    description: "Kualitas maksimal, CPU tinggi. Cocok untuk device flagship.",
    cpu: "high",
    quality: "high",
  },
  balanced: {
    name: "Balanced (Recommended)",
    description: "Seimbang antara kualitas & performa. Cocok untuk mayoritas.",
    cpu: "medium",
    quality: "high",
  },
  performance: {
    name: "Performance",
    description: "CPU hemat, kualitas tetap OK. Cocok untuk multitasking.",
    cpu: "low",
    quality: "medium",
  },
  battery_saver: {
    name: "Battery Saver",
    description: "Extreme CPU saving. Kualitas minimal, battery maksimal.",
    cpu: "low",
    quality: "low",
  },
};

// ============================================================
// STATE (in-memory)
// ============================================================

let currentConfig: AudioConfigShape = { ...DEFAULT_AUDIO_CONFIG };
let currentPreset: AudioQualityPreset | "custom" = "balanced";

// ============================================================
// GETTERS
// ============================================================

export function getAudioConfig(): AudioConfigShape {
  return { ...currentConfig };  // return copy (immutable)
}

export function getAudioPreset(): AudioQualityPreset | "custom" {
  return currentPreset;
}

// ============================================================
// SETTERS
// ============================================================

/**
 * Apply preset lengkap (replace semua config).
 */
export function applyAudioPreset(preset: AudioQualityPreset): AudioConfigShape {
  currentConfig = { ...AUDIO_PRESETS[preset] };
  currentPreset = preset;
  return getAudioConfig();
}

/**
 * Update 1 field config (partial update).
 * @example updateAudioConfig("gain.headroom", 0.95)
 */
export function updateAudioConfig<K extends keyof AudioConfigShape>(
  section: K,
  value: Partial<AudioConfigShape[K]>,
): AudioConfigShape {
  currentConfig = {
    ...currentConfig,
    [section]: {
      ...currentConfig[section],
      ...value,
    },
  };
  currentPreset = "custom";  // mark as custom (no longer match preset)
  return getAudioConfig();
}

/**
 * Reset ke default.
 */
export function resetAudioConfig(): AudioConfigShape {
  currentConfig = { ...DEFAULT_AUDIO_CONFIG };
  currentPreset = "balanced";
  return getAudioConfig();
}

// ============================================================
// PERSISTENCE (AsyncStorage)
// ============================================================

export async function saveAudioConfig(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(currentConfig));
    await AsyncStorage.setItem(PRESET_KEY, currentPreset);
  } catch (e) {
    console.warn("[audioConfig] save failed:", e);
  }
}

export async function loadAudioConfig(): Promise<AudioConfigShape> {
  try {
    const [configRaw, presetRaw] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEY),
      AsyncStorage.getItem(PRESET_KEY),
    ]);

    if (configRaw) {
      const parsed = JSON.parse(configRaw);
      // Merge dengan default (untuk handle missing fields)
      currentConfig = deepMerge(DEFAULT_AUDIO_CONFIG, parsed);
    }

    if (presetRaw) {
      currentPreset = presetRaw as AudioQualityPreset | "custom";
    }
  } catch (e) {
    console.warn("[audioConfig] load failed, using default:", e);
    currentConfig = { ...DEFAULT_AUDIO_CONFIG };
    currentPreset = "balanced";
  }

  return getAudioConfig();
}

// ============================================================
// VALIDATION
// ============================================================

export interface ValidationError {
  field: string;
  message: string;
}

export function validateAudioConfig(
  config: AudioConfigShape,
): ValidationError[] {
  const errors: ValidationError[] = [];

  // filterSize
  if (config.filterSize.low < 16 || config.filterSize.low > 256) {
    errors.push({
      field: "filterSize.low",
      message: "Must be between 16 and 256",
    });
  }
  if (config.filterSize.high < 16 || config.filterSize.high > 256) {
    errors.push({
      field: "filterSize.high",
      message: "Must be between 16 and 256",
    });
  }

  // queue (power of 2)
  if (
    config.queue.capacityFrames <= 0 ||
    (config.queue.capacityFrames & (config.queue.capacityFrames - 1)) !== 0
  ) {
    errors.push({
      field: "queue.capacityFrames",
      message: "Must be a power of 2 (e.g. 1<<20)",
    });
  }
  if (config.queue.capacityFrames < 1 << 18) {
    errors.push({
      field: "queue.capacityFrames",
      message: "Too small (min 1<<18 = 2.7s)",
    });
  }
  if (config.queue.capacityFrames > 1 << 22) {
    errors.push({
      field: "queue.capacityFrames",
      message: "Too large (max 1<<22 = 43.6s)",
    });
  }

  // flowControl
  if (
    config.flowControl.pauseThreshold <= config.flowControl.resumeThreshold
  ) {
    errors.push({
      field: "flowControl",
      message: "pauseThreshold must be > resumeThreshold",
    });
  }
  if (
    config.flowControl.pauseThreshold < 0 ||
    config.flowControl.pauseThreshold > 100
  ) {
    errors.push({
      field: "flowControl.pauseThreshold",
      message: "Must be 0-100",
    });
  }
  if (
    config.flowControl.resumeThreshold < 0 ||
    config.flowControl.resumeThreshold > 100
  ) {
    errors.push({
      field: "flowControl.resumeThreshold",
      message: "Must be 0-100",
    });
  }

  // gain
  if (config.gain.headroom < 0.0 || config.gain.headroom > 1.0) {
    errors.push({
      field: "gain.headroom",
      message: "Must be 0.0-1.0",
    });
  }

  // resampler
  if (config.resampler.cutoff < 0.9 || config.resampler.cutoff > 1.0) {
    errors.push({
      field: "resampler.cutoff",
      message: "Must be 0.90-1.0",
    });
  }
  if (
    config.resampler.ditherScale < 0.0 ||
    config.resampler.ditherScale > 1.0
  ) {
    errors.push({
      field: "resampler.ditherScale",
      message: "Must be 0.0-1.0",
    });
  }

  // sampleRate
  if (![44100, 48000, 96000, 192000].includes(config.sampleRate.target)) {
    errors.push({
      field: "sampleRate.target",
      message: "Must be 44100, 48000, 96000, or 192000",
    });
  }

  // oboe
  if (
    config.oboe.framesPerBurst !== 0 &&
    (config.oboe.framesPerBurst < 96 || config.oboe.framesPerBurst > 960)
  ) {
    errors.push({
      field: "oboe.framesPerBurst",
      message: "Must be 0 (auto) or 96-960",
    });
  }

  // decoder
  if (config.decoder.chunkSize < 1024 || config.decoder.chunkSize > 8192) {
    errors.push({
      field: "decoder.chunkSize",
      message: "Must be 1024-8192",
    });
  }

  return errors;
}

// ============================================================
// HELPERS
// ============================================================

/**
 * Deep merge config (recursive untuk nested objects).
 */
function deepMerge<T extends Record<string, any>>(
  base: T,
  override: Partial<T>,
): T {
  const result = { ...base };
  for (const key of Object.keys(override) as (keyof T)[]) {
    const baseVal = base[key];
    const overrideVal = override[key];
    if (
      baseVal &&
      overrideVal &&
      typeof baseVal === "object" &&
      typeof overrideVal === "object" &&
      !Array.isArray(baseVal)
    ) {
      result[key] = deepMerge(baseVal as any, overrideVal as any) as T[keyof T];
    } else if (overrideVal !== undefined) {
      result[key] = overrideVal as T[keyof T];
    }
  }
  return result;
}

/**
 * Format config untuk native (flat key-value pairs).
 * Untuk future JNI setConfig call.
 */
export function configToNativePairs(
  config: AudioConfigShape = currentConfig,
): Array<{ key: string; value: number | string | boolean }> {
  return [
    { key: "filterSize.low", value: config.filterSize.low },
    { key: "filterSize.high", value: config.filterSize.high },
    { key: "queue.capacityFrames", value: config.queue.capacityFrames },
    { key: "flowControl.pauseThreshold", value: config.flowControl.pauseThreshold },
    { key: "flowControl.resumeThreshold", value: config.flowControl.resumeThreshold },
    { key: "gain.headroom", value: config.gain.headroom },
    { key: "resampler.cutoff", value: config.resampler.cutoff },
    { key: "resampler.ditherScale", value: config.resampler.ditherScale },
    { key: "sampleRate.target", value: config.sampleRate.target },
    { key: "sampleRate.mode", value: config.sampleRate.mode },
    { key: "oboe.framesPerBurst", value: config.oboe.framesPerBurst },
    { key: "oboe.perfMode", value: config.oboe.perfMode },
    { key: "oboe.sharingMode", value: config.oboe.sharingMode },
    { key: "oboe.api", value: config.oboe.api },
    { key: "decoder.chunkSize", value: config.decoder.chunkSize },
    { key: "decoder.gapless", value: config.decoder.gapless },
    { key: "decoder.skipSilence", value: config.decoder.skipSilence },
    { key: "experimental.preloadNextTrack", value: config.experimental.preloadNextTrack },
    { key: "experimental.sampleRateSwitch", value: config.experimental.sampleRateSwitch },
  ];
}

/**
 * Compare 2 config (untuk detect dirty state di UI).
 */
export function isConfigEqual(
  a: AudioConfigShape,
  b: AudioConfigShape,
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Detect apakah config match dengan salah satu preset.
 */
export function detectPreset(
  config: AudioConfigShape,
): AudioQualityPreset | "custom" {
  for (const [presetName, presetConfig] of Object.entries(AUDIO_PRESETS)) {
    if (isConfigEqual(config, presetConfig)) {
      return presetName as AudioQualityPreset;
    }
  }
  return "custom";
} 