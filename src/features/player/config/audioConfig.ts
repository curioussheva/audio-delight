/**
 * Audio Config — PLACEHOLDER (belum aktif)
 * 
 * ⚠️ UNUSED untuk saat ini — config di-hardcode di C++.
 * 
 * Future use (v1.1):
 * - User settings UI: High / Balanced / Performance / Battery Saver
 * - Butuh JNI: NativePlaybackService.setConfig(filterSize, queueSize, ...)
 * - Config akan apply saat decoder init
 * 
 * Untuk sekarang, referensi config actual:
 * - FFmpegDecoder.cpp: filter_size 128 / 64 (adaptive)
 * - PlaybackController.cpp: queue 1<<21 (21.8s), hysteresis 80/40
 * - FFmpegDecoder.cpp: kGain 0.89 (-1 dB)
 * - AudioTypes.h: processingMode = BitPerfect (default)
 */

// Keep existing code below...

export interface AudioConfigShape {
  filterSize: { low: number; high: number };
  queue: { capacityFrames: number };
  flowControl: { pauseThreshold: number; resumeThreshold: number };
  gain: { headroom: number };
  resampler: { cutoff: number; ditherScale: number };
}

export const DEFAULT_AUDIO_CONFIG: AudioConfigShape = {
  filterSize: { low: 128, high: 64 },
  queue: { capacityFrames: 1 << 21 },
  flowControl: { pauseThreshold: 80, resumeThreshold: 40 },
  gain: { headroom: 0.89 },
  resampler: { cutoff: 0.97, ditherScale: 0.5 },
};

export type AudioQualityPreset = "high" | "balanced" | "performance" | "battery_saver";

export const AUDIO_PRESETS: Record<AudioQualityPreset, AudioConfigShape> = {
  high: {
    filterSize: { low: 128, high: 128 },
    queue: { capacityFrames: 1 << 21 },
    flowControl: { pauseThreshold: 80, resumeThreshold: 40 },
    gain: { headroom: 0.89 },
    resampler: { cutoff: 0.97, ditherScale: 1.0 },
  },
  balanced: {
    filterSize: { low: 128, high: 64 },
    queue: { capacityFrames: 1 << 21 },
    flowControl: { pauseThreshold: 80, resumeThreshold: 40 },
    gain: { headroom: 0.89 },
    resampler: { cutoff: 0.97, ditherScale: 0.5 },
  },
  performance: {
    filterSize: { low: 64, high: 32 },
    queue: { capacityFrames: 1 << 20 },
    flowControl: { pauseThreshold: 75, resumeThreshold: 45 },
    gain: { headroom: 0.89 },
    resampler: { cutoff: 0.95, ditherScale: 0.5 },
  },
  battery_saver: {
    filterSize: { low: 32, high: 16 },
    queue: { capacityFrames: 1 << 20 },
    flowControl: { pauseThreshold: 75, resumeThreshold: 45 },
    gain: { headroom: 0.89 },
    resampler: { cutoff: 0.95, ditherScale: 0.0 },
  },
};

let currentConfig: AudioConfigShape = { ...DEFAULT_AUDIO_CONFIG };
let presetName: AudioQualityPreset = "balanced";

export function getAudioConfig(): AudioConfigShape {
  return currentConfig;
}

export function getAudioPreset(): AudioQualityPreset {
  return presetName;
}

export function applyAudioPreset(preset: AudioQualityPreset): AudioConfigShape {
  currentConfig = { ...AUDIO_PRESETS[preset] };
  presetName = preset;
  return currentConfig;
}

// ─────────────────────────────────────────────
// Display helper (untuk settings UI nanti)
// ─────────────────────────────────────────────
export function getPresetDescription(preset: AudioQualityPreset): string {
  switch (preset) {
    case "high": return "Kualitas maksimal, CPU tinggi";
    case "balanced": return "Seimbang (recommended)";
    case "performance": return "CPU hemat, kualitas ok";
    case "battery_saver": return "Baterai hemat, kualitas minimal";
  }
}
