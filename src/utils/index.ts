// ─── Time ─────────────────────────────────────────────────────────────────
export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── Gain / dB ────────────────────────────────────────────────────────────
export function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

export function linearToDb(linear: number): number {
  return 20 * Math.log10(Math.max(linear, 1e-6));
}

export function formatGain(gain: number): string {
  if (gain === 0) return '0';
  return gain > 0 ? `+${gain}` : `${gain}`;
}

// ─── File ─────────────────────────────────────────────────────────────────
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── FFT ──────────────────────────────────────────────────────────────────
/**
 * Normalize FFT bin values 0-1 with optional min threshold.
 */
export function normalizeFFT(data: number[], minThreshold = 0.01): number[] {
  return data.map((v) => Math.max(minThreshold, v));
}
