// src/features/equalizer/api/knobMath.ts
//
// Matematika murni untuk ControlKnob (tab Equalizer / Audio Mode).
// Dipisah dari komponen supaya bisa diuji tanpa React Native / Reanimated.
//
// Rentang rotasi knob: -135..+135 derajat (270 derajat total) untuk
// nilai 0..1000. Drag vertikal: seret ke ATAS menaikkan nilai
// (translationY negatif -> rotasi naik).
//
// Sensitivitas 1.5: rentang penuh 270 derajat tercapai dalam drag
// 270 / 1.5 = 180px. Nilai lama 0.5 butuh 540px — hampir satu layar
// penuh — sehingga 100% praktis tidak tercapai.

export const KNOB_MIN_ROTATION = -135;
export const KNOB_MAX_ROTATION = 135;
export const KNOB_SENSITIVITY = 1.5;

/** Rotasi (derajat) untuk nilai 0..1000. */
export function rotationForValue(value: number): number {
  "worklet"; // dipanggil dari gesture (UI thread) dan useEffect
  const clamped = Math.min(1000, Math.max(0, value));
  return (
    KNOB_MIN_ROTATION +
    ((clamped / 1000) * (KNOB_MAX_ROTATION - KNOB_MIN_ROTATION))
  );
}

/** Nilai 0..1000 untuk rotasi (derajat). */
export function valueForRotation(rotation: number): number {
  "worklet"; // dipanggil dari gesture (UI thread)
  const clamped = Math.min(
    KNOB_MAX_ROTATION,
    Math.max(KNOB_MIN_ROTATION, rotation),
  );
  return (
    ((clamped - KNOB_MIN_ROTATION) /
      (KNOB_MAX_ROTATION - KNOB_MIN_ROTATION)) *
    1000
  );
}

/**
 * Rotasi baru saat drag dari `startRotation` sejauh `translationY` px.
 * Dijepit ke [-135, 135] supaya knob tidak berputar lewat ujung.
 */
export function rotationForDrag(
  startRotation: number,
  translationY: number,
  sensitivity: number = KNOB_SENSITIVITY,
): number {
  "worklet"; // dipanggil dari gesture (UI thread)
  const newRot = startRotation - translationY * sensitivity;
  return Math.min(KNOB_MAX_ROTATION, Math.max(KNOB_MIN_ROTATION, newRot));
}
