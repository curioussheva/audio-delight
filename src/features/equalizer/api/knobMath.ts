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

// ─── Drag melingkar (rotary, R10) ────────────────────────────────────────────
//
// Sudut pointer dihitung dari pusat knob: atan2(dy, dx) dalam derajat,
// 0 = kanan, positif = searah jarum jam di layar (sumbu y ke bawah).
// Pointer knob di rotasi 0 menunjuk ke atas (sudut -90), jadi putaran
// searah jarum jam menaikkan rotasi — dan nilai — secara langsung
// (delta sudut == delta rotasi, tanpa faktor konversi).

/** Jari-jari minimum (px) dari pusat knob agar sudut pointer stabil —
 * sentuhan yang terlalu dekat ke pusat diabaikan (atan2 tidak stabil). */
export const KNOB_ROTARY_MIN_RADIUS = 20;

/** Jari-jari maksimum (px) sentuhan awal yang dianggap "di atas knob" —
 * KNOB_SIZE 120 -> jari-jari 60 + toleransi 10. Sentuhan awal di luar
 * ini (label di atas / readout di bawah) tetap memakai drag vertikal. */
export const KNOB_ROTARY_MAX_RADIUS = 70;

/** Sudut pointer (derajat) dari titik (x, y) terhadap pusat (cx, cy). */
export function pointerAngleDeg(
  x: number,
  y: number,
  cx: number,
  cy: number,
): number {
  "worklet"; // dipanggil dari gesture (UI thread)
  return (Math.atan2(y - cy, x - cx) * 180) / Math.PI;
}

/**
 * Selisih sudut terpendek (-180, 180] — unwrap supaya putaran yang
 * melewati ±180° tidak lompat (mis. -170 -> 170 = +20, bukan -340).
 */
export function unwrapAngleDelta(current: number, previous: number): number {
  "worklet"; // dipanggil dari gesture (UI thread)
  let delta = current - previous;
  while (delta > 180) delta -= 360;
  while (delta <= -180) delta += 360;
  return delta;
}

/**
 * Rotasi baru dari delta sudut pointer (drag melingkar), dijepit ke
 * [-135, 135] seperti rotationForDrag.
 */
export function rotationForAngleDelta(
  rotation: number,
  angleDelta: number,
): number {
  "worklet"; // dipanggil dari gesture (UI thread)
  const newRot = rotation + angleDelta;
  return Math.min(KNOB_MAX_ROTATION, Math.max(KNOB_MIN_ROTATION, newRot));
}
