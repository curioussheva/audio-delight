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

/** Posisi y (titik tengah thumb) untuk nilai min..max. max -> y = 12.
 *  Default min/max = DSP_SLIDER_MIN/MAX (0..1000) — pemakaian lama
 *  (bass/widener) tidak berubah. Master gain memakai min 0 / max 1.5. */
export function dspValueToY(
  value: number,
  sliderHeight: number = DSP_SLIDER_HEIGHT,
  min: number = DSP_SLIDER_MIN,
  max: number = DSP_SLIDER_MAX,
): number {
  "worklet"; // dipanggil dari gesture (UI thread) dan useEffect
  const clamped = Math.min(max, Math.max(min, value));
  const top = DSP_THUMB_HALF_HEIGHT;
  const bottom = sliderHeight - DSP_THUMB_HALF_HEIGHT;
  return (
    bottom - ((clamped - min) / (max - min)) * (bottom - top)
  );
}

/** Nilai min..max untuk posisi y (titik tengah thumb). y = 12 -> max.
 *  Sengaja TIDAK dibulatkan: rentang 0..1000 (bass/widener) praktis
 *  tetap bulat di ujung, tapi rentang 0..1.5 (master gain) butuh pecahan —
 *  pembulatan di sini akan memotongnya jadi 0/1/2. Pembulatan tampilan
 *  urusan komponen (formatValue), bukan matematika ini. */
export function dspYToValue(
  y: number,
  sliderHeight: number = DSP_SLIDER_HEIGHT,
  min: number = DSP_SLIDER_MIN,
  max: number = DSP_SLIDER_MAX,
): number {
  "worklet"; // dipanggil dari gesture (UI thread)
  const top = DSP_THUMB_HALF_HEIGHT;
  const bottom = sliderHeight - DSP_THUMB_HALF_HEIGHT;
  const clamped = Math.min(bottom, Math.max(top, y));
  return max - ((clamped - top) / (bottom - top)) * (max - min);
}
