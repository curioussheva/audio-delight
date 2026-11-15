// src/__tests__/features/equalizer/bandThumbMath.test.ts
import {
  DEFAULT_SLIDER_HEIGHT,
  THUMB_HALF_HEIGHT,
  gainToY,
  yToGain,
} from "@/features/equalizer/api/bandThumbMath";

const H = DEFAULT_SLIDER_HEIGHT;

describe("gainToY / yToGain", () => {
  it("ujung-ujung ter-inset: +10 -> y = 12, -10 -> y = SLIDER_HEIGHT - 12", () => {
    expect(gainToY(10)).toBe(THUMB_HALF_HEIGHT);
    expect(gainToY(-10)).toBe(H - THUMB_HALF_HEIGHT);
    expect(yToGain(THUMB_HALF_HEIGHT)).toBe(10);
    expect(yToGain(H - THUMB_HALF_HEIGHT)).toBe(-10);
  });

  it("tengah: 0 dB -> y = SLIDER_HEIGHT / 2", () => {
    expect(gainToY(0)).toBe(H / 2);
    expect(yToGain(H / 2)).toBe(0);
  });

  it("round-trip gain -> y -> gain tepat tiap langkah 0.1 dB", () => {
    for (let g10 = -100; g10 <= 100; g10++) {
      const gain = g10 / 10;
      expect(yToGain(gainToY(gain))).toBeCloseTo(gain, 9);
    }
  });

  it("input di luar rentang dijepit", () => {
    expect(gainToY(20)).toBe(THUMB_HALF_HEIGHT);
    expect(gainToY(-20)).toBe(H - THUMB_HALF_HEIGHT);
    expect(yToGain(0)).toBe(10);
    expect(yToGain(1000)).toBe(-10);
  });
});
