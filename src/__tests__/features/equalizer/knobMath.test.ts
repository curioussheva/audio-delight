// src/__tests__/features/equalizer/knobMath.test.ts
import {
  KNOB_MAX_ROTATION,
  KNOB_MIN_ROTATION,
  KNOB_SENSITIVITY,
  pointerAngleDeg,
  rotationForAngleDelta,
  rotationForDrag,
  rotationForValue,
  unwrapAngleDelta,
  valueForRotation,
} from "@/features/equalizer/api/knobMath";

describe("rotationForValue / valueForRotation", () => {
  it("ujung-ujung: 0 -> -135, 1000 -> +135", () => {
    expect(rotationForValue(0)).toBe(KNOB_MIN_ROTATION);
    expect(rotationForValue(1000)).toBe(KNOB_MAX_ROTATION);
    expect(valueForRotation(KNOB_MIN_ROTATION)).toBe(0);
    expect(valueForRotation(KNOB_MAX_ROTATION)).toBe(1000);
  });

  it("tengah: 500 -> 0 derajat", () => {
    expect(rotationForValue(500)).toBe(0);
    expect(valueForRotation(0)).toBe(500);
  });

  it("di luar rentang dijepit", () => {
    expect(rotationForValue(-50)).toBe(KNOB_MIN_ROTATION);
    expect(rotationForValue(1200)).toBe(KNOB_MAX_ROTATION);
    expect(valueForRotation(-200)).toBe(0);
    expect(valueForRotation(200)).toBe(1000);
  });
});

describe("rotationForDrag", () => {
  it("rentang penuh 0 -> 1000 tercapai dalam drag 180px (sensitivitas 1.5)", () => {
    expect(KNOB_SENSITIVITY).toBe(1.5);
    // Dari bawah (-135) seret ke atas 180px -> 135.
    const endRot = rotationForDrag(KNOB_MIN_ROTATION, -180);
    expect(endRot).toBe(KNOB_MAX_ROTATION);
    expect(valueForRotation(endRot)).toBe(1000);
    // Sebaliknya: dari atas (+135) seret ke bawah 180px -> -135.
    const backRot = rotationForDrag(KNOB_MAX_ROTATION, 180);
    expect(backRot).toBe(KNOB_MIN_ROTATION);
    expect(valueForRotation(backRot)).toBe(0);
  });

  it("drag melewati ujung dijepit di 1000 / 0", () => {
    expect(valueForRotation(rotationForDrag(KNOB_MIN_ROTATION, -500))).toBe(
      1000,
    );
    expect(valueForRotation(rotationForDrag(KNOB_MAX_ROTATION, 500))).toBe(0);
    expect(valueForRotation(rotationForDrag(0, -1000))).toBe(1000);
    expect(valueForRotation(rotationForDrag(0, 1000))).toBe(0);
  });

  it("nilai tengah drag monoton naik saat seret ke atas", () => {
    let prev = -Infinity;
    for (let dy = 0; dy >= -180; dy -= 15) {
      const v = valueForRotation(rotationForDrag(KNOB_MIN_ROTATION, dy));
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    // Setengah jalan (90px) -> setengah rentang.
    expect(valueForRotation(rotationForDrag(KNOB_MIN_ROTATION, -90))).toBe(500);
  });
});

describe("drag melingkar (rotary, R10)", () => {
  it("pointerAngleDeg: kanan 0, bawah 90, kiri 180, atas -90", () => {
    const cx = 70;
    const cy = 88;
    expect(pointerAngleDeg(cx + 50, cy, cx, cy)).toBe(0); // kanan
    expect(pointerAngleDeg(cx, cy + 50, cx, cy)).toBe(90); // bawah
    expect(pointerAngleDeg(cx - 50, cy, cx, cy)).toBe(180); // kiri
    expect(pointerAngleDeg(cx, cy - 50, cx, cy)).toBe(-90); // atas
  });

  it("unwrapAngleDelta: melewati ±180 tidak lompat", () => {
    expect(unwrapAngleDelta(170, -170)).toBe(-20);
    expect(unwrapAngleDelta(-170, 170)).toBe(20);
    expect(unwrapAngleDelta(10, 0)).toBe(10);
    expect(unwrapAngleDelta(-10, 0)).toBe(-10);
    expect(unwrapAngleDelta(180, -180)).toBe(0);
  });

  it("rotationForAngleDelta dijepit di ujung", () => {
    expect(rotationForAngleDelta(KNOB_MAX_ROTATION, 45)).toBe(
      KNOB_MAX_ROTATION,
    );
    expect(rotationForAngleDelta(KNOB_MIN_ROTATION, -45)).toBe(
      KNOB_MIN_ROTATION,
    );
    expect(rotationForAngleDelta(0, 45)).toBe(45);
    expect(rotationForAngleDelta(0, -45)).toBe(-45);
  });

  it("melingkar searah jarum jam dari atas menaikkan nilai secara mulus", () => {
    // Busur 90° searah jarum jam dari atas (-90 -> 0): delta +45 tiap langkah.
    let rotation = rotationForValue(500); // 0
    let prevAngle = -90;
    for (const angle of [-45, 0]) {
      rotation = rotationForAngleDelta(
        rotation,
        unwrapAngleDelta(angle, prevAngle),
      );
      prevAngle = angle;
    }
    expect(rotation).toBe(90);
    expect(valueForRotation(rotation)).toBeCloseTo(833.33, 1);
  });

  it("melingkar berlawanan jarum jam dari atas menurunkan nilai", () => {
    // Busur 90° berlawanan jarum jam dari atas (-90 -> -180).
    let rotation = rotationForValue(500); // 0
    let prevAngle = -90;
    for (const angle of [-135, -180]) {
      rotation = rotationForAngleDelta(
        rotation,
        unwrapAngleDelta(angle, prevAngle),
      );
      prevAngle = angle;
    }
    expect(rotation).toBe(-90);
    expect(valueForRotation(rotation)).toBeCloseTo(166.67, 1);
  });

  it("putaran penuh searah jarum jam melewati ±180 tanpa lompat, dijepit di maks", () => {
    // Lingkaran penuh dari atas: -90 -> -45 -> 0 -> 45 -> 90 -> 135 ->
    // 180 -> -135 -> -90. Delta tiap langkah +45 (unwrap menangani
    // lompatan 180 -> -135). Total +360 tapi dijepit di +135.
    let rotation = rotationForValue(500); // 0
    let prevAngle = -90;
    for (const angle of [-45, 0, 45, 90, 135, 180, -135, -90]) {
      rotation = rotationForAngleDelta(
        rotation,
        unwrapAngleDelta(angle, prevAngle),
      );
      prevAngle = angle;
    }
    expect(rotation).toBe(KNOB_MAX_ROTATION);
    expect(valueForRotation(rotation)).toBe(1000);
  });
});
