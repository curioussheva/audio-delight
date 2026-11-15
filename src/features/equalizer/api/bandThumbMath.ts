// src/features/equalizer/api/bandThumbMath.ts
//
// Matematika murni untuk thumb fader di Band.tsx (tab Equalizer).
// Dipisah dari komponen supaya bisa diuji tanpa React Native / Reanimated.
//
// Thumb 24px, diposisikan lewat `translateY - 12` sehingga TITIK TENGAH
// thumb ada di translateY. Kalau travel thumb dibiarkan [0, SLIDER_HEIGHT],
// di gain +10/-10 setengah thumb (12px) menggantung di luar track dan
// terpotong parent — slider terlihat terpotong setengah. Karena itu travel
// di-inset ke [12, SLIDER_HEIGHT - 12]: tengah thumb selalu di dalam track.

export const DEFAULT_SLIDER_HEIGHT = 160;
export const THUMB_HALF_HEIGHT = 12;
export const MIN_GAIN_DB = -10;
export const MAX_GAIN_DB = 10;

/** Posisi y (titik tengah thumb) untuk gain dB. gain +10 -> y = 12. */
export function gainToY(
  gain: number,
  sliderHeight: number = DEFAULT_SLIDER_HEIGHT,
): number {
  "worklet"; // dipanggil dari gesture (UI thread) dan useEffect
  const clamped = Math.min(MAX_GAIN_DB, Math.max(MIN_GAIN_DB, gain));
  const top = THUMB_HALF_HEIGHT;
  const bottom = sliderHeight - THUMB_HALF_HEIGHT;
  return bottom - ((clamped - MIN_GAIN_DB) / (MAX_GAIN_DB - MIN_GAIN_DB)) * (bottom - top);
}

/** Gain dB untuk posisi y (titik tengah thumb). y = 12 -> gain +10. */
export function yToGain(
  y: number,
  sliderHeight: number = DEFAULT_SLIDER_HEIGHT,
): number {
  "worklet"; // dipanggil dari gesture (UI thread)
  const top = THUMB_HALF_HEIGHT;
  const bottom = sliderHeight - THUMB_HALF_HEIGHT;
  const clamped = Math.min(bottom, Math.max(top, y));
  return (
    MAX_GAIN_DB -
    ((clamped - top) / (bottom - top)) * (MAX_GAIN_DB - MIN_GAIN_DB)
  );
}
