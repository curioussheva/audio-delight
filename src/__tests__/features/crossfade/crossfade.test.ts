// src/__tests__/features/crossfade/crossfade.test.ts
//
// Logika murni crossfade (clamp + label) — tanpa mock native.

import {
  CROSSFADE_MAX_SECONDS,
  CROSSFADE_MIN_SECONDS,
  clampCrossfadeSeconds,
  formatCrossfadeLabel,
} from "@/features/crossfade/crossfade";

describe("crossfade (logika murni)", () => {
  it("batas 0..12 dtk", () => {
    expect(CROSSFADE_MIN_SECONDS).toBe(0);
    expect(CROSSFADE_MAX_SECONDS).toBe(12);
  });

  it("clampCrossfadeSeconds: dalam rentang lolos, luar di-clamp", () => {
    expect(clampCrossfadeSeconds(0)).toBe(0);
    expect(clampCrossfadeSeconds(5)).toBe(5);
    expect(clampCrossfadeSeconds(2.5)).toBe(2.5);
    expect(clampCrossfadeSeconds(12)).toBe(12);
    expect(clampCrossfadeSeconds(20)).toBe(12);
    expect(clampCrossfadeSeconds(-3)).toBe(0);
    expect(clampCrossfadeSeconds(NaN)).toBe(0);
    expect(clampCrossfadeSeconds(Infinity)).toBe(0);
  });

  it("formatCrossfadeLabel: 0 = Mati, bulat tanpa desimal, pecahan koma", () => {
    expect(formatCrossfadeLabel(0)).toBe("Mati");
    expect(formatCrossfadeLabel(5)).toBe("5 dtk");
    expect(formatCrossfadeLabel(12)).toBe("12 dtk");
    expect(formatCrossfadeLabel(2.5)).toBe("2,5 dtk");
    expect(formatCrossfadeLabel(20)).toBe("12 dtk");
  });
});
