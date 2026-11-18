// src/features/equalizer/api/verticalSliderMath.ts
//
// Matematika murni untuk thumb slider vertikal DSP (tab Audio Mode,
// opsi B Fase 3) — bass boost + pelebar stereo yang dulu knob.
// Dipisah dari komponen supaya bisa diuji tanpa React Native / Reanimated.
//
// Rentang nilai SAMA dengan knob lama (0..1000) dan dengan yang diterima
// Kotlin (bass 0..+12 dB, widener width 1.0..2.0), jadi tanpa konversi —
// hanya pemetaan posisi.
//
// Thumb 24px (sama seperti fader band di Band.tsx), diposisikan lewat
// `translateY - 12` sehingga TITIK TENGAH thumb ada di translateY.
// Travel di-inset ke [12, SLIDER_HEIGHT - 12] supaya di 0/1000 setengah
// thumb tidak menggantung di luar track dan terpotong parent.

export const DSP_SLIDER_HEIGHT = 160;
export const DSP_THUMB_HALF_HEIGHT = 12;
export const DSP_SLIDER_MIN = 0;
export const DSP_SLIDER_MAX = 1000;

/** Posisi y (titik tengah thumb) untuk nilai 0..1000. 1000 -> y = 12. */
export function dspValueToY(
  value: number,
  sliderHeight: number = DSP_SLIDER_HEIGHT,
): number {
  "worklet"; // dipanggil dari gesture (UI thread) dan useEffect
  const clamped = Math.min(
    DSP_SLIDER_MAX,
    Math.max(DSP_SLIDER_MIN, value),
  );
  const top = DSP_THUMB_HALF_HEIGHT;
  const bottom = sliderHeight - DSP_THUMB_HALF_HEIGHT;
  return (
    bottom -
    ((clamped - DSP_SLIDER_MIN) / (DSP_SLIDER_MAX - DSP_SLIDER_MIN)) *
      (bottom - top)
  );
}

/** Nilai 0..1000 untuk posisi y (titik tengah thumb). y = 12 -> 1000. */
export function dspYToValue(
  y: number,
  sliderHeight: number = DSP_SLIDER_HEIGHT,
): number {
  "worklet"; // dipanggil dari gesture (UI thread)
  const top = DSP_THUMB_HALF_HEIGHT;
  const bottom = sliderHeight - DSP_THUMB_HALF_HEIGHT;
  const clamped = Math.min(bottom, Math.max(top, y));
  return Math.round(
    DSP_SLIDER_MAX -
      ((clamped - top) / (bottom - top)) *
        (DSP_SLIDER_MAX - DSP_SLIDER_MIN),
  );
}
