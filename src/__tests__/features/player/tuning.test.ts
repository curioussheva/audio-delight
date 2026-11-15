import {
  A432_CENTS,
  centsToFrequency,
  clampTuningCents,
} from "@/features/player/utils/tuning";

describe("centsToFrequency", () => {
  it("0 sen = 440 Hz (A standar)", () => {
    expect(centsToFrequency(0)).toBeCloseTo(440, 10);
  });

  it("A=432 ≈ −31,77 sen", () => {
    expect(A432_CENTS).toBeCloseTo(-31.77, 2);
    expect(centsToFrequency(A432_CENTS)).toBeCloseTo(432, 1);
    expect(centsToFrequency(-31.77)).toBeCloseTo(432, 1);
  });

  it("+100 sen ≈ 466,16 Hz, −100 sen ≈ 415,30 Hz", () => {
    expect(centsToFrequency(100)).toBeCloseTo(466.16, 2);
    expect(centsToFrequency(-100)).toBeCloseTo(415.3, 2);
  });
});

describe("clampTuningCents", () => {
  it("menjepit ke ±100 sen", () => {
    expect(clampTuningCents(150)).toBe(100);
    expect(clampTuningCents(-150)).toBe(-100);
    expect(clampTuningCents(42)).toBe(42);
  });
});
