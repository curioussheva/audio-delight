// src/__tests__/features/equalizer/knobMath.test.ts
import {
  KNOB_MAX_ROTATION,
  KNOB_MIN_ROTATION,
  KNOB_SENSITIVITY,
  rotationForDrag,
  rotationForValue,
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
