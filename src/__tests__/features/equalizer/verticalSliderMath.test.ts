// FASE 3 EQ/DSP (opsi B) — matematika slider vertikal DSP: ujung,
// tengah, clamp, dan round-trip nilai <-> posisi.
import {
  DSP_SLIDER_HEIGHT,
  DSP_SLIDER_MAX,
  DSP_SLIDER_MIN,
  dspValueToY,
  dspYToValue,
} from "@/features/equalizer/api/verticalSliderMath";

describe("verticalSliderMath (slider vertikal DSP)", () => {
  it("ujung: 1000 di atas (y=12), 0 di bawah (y=H-12)", () => {
    expect(dspValueToY(1000)).toBe(12);
    expect(dspValueToY(0)).toBe(DSP_SLIDER_HEIGHT - 12);
  });

  it("tengah: 500 di tengah track", () => {
    expect(dspValueToY(500)).toBe(DSP_SLIDER_HEIGHT / 2);
  });

  it("yToValue ujung: y=12 -> 1000, y=H-12 -> 0", () => {
    expect(dspYToValue(12)).toBe(1000);
    expect(dspYToValue(DSP_SLIDER_HEIGHT - 12)).toBe(0);
  });

  it("yToValue menjepit di luar track", () => {
    expect(dspYToValue(-50)).toBe(DSP_SLIDER_MAX);
    expect(dspYToValue(DSP_SLIDER_HEIGHT + 50)).toBe(DSP_SLIDER_MIN);
  });

  it("dspValueToY menjepit nilai di luar 0..1000", () => {
    expect(dspValueToY(1500)).toBe(12);
    expect(dspValueToY(-200)).toBe(DSP_SLIDER_HEIGHT - 12);
  });

  it("round-trip: nilai -> y -> nilai kembali (±1 pembulatan)", () => {
    for (const v of [0, 100, 250, 500, 750, 900, 1000]) {
      expect(Math.abs(dspYToValue(dspValueToY(v)) - v)).toBeLessThanOrEqual(
        1,
      );
    }
  });

  it("rentang kustom 0..1.5 (master gain): ujung + tengah + round-trip", () => {
    expect(dspValueToY(1.5, DSP_SLIDER_HEIGHT, 0, 1.5)).toBe(12);
    expect(dspValueToY(0, DSP_SLIDER_HEIGHT, 0, 1.5)).toBe(
      DSP_SLIDER_HEIGHT - 12,
    );
    expect(dspValueToY(0.75, DSP_SLIDER_HEIGHT, 0, 1.5)).toBe(
      DSP_SLIDER_HEIGHT / 2,
    );
    expect(dspYToValue(12, DSP_SLIDER_HEIGHT, 0, 1.5)).toBeCloseTo(1.5, 9);
    expect(dspYToValue(DSP_SLIDER_HEIGHT - 12, DSP_SLIDER_HEIGHT, 0, 1.5)).toBeCloseTo(
      0,
      9,
    );
    for (const v of [0, 0.25, 0.5, 1, 1.25, 1.5]) {
      expect(
        Math.abs(dspYToValue(dspValueToY(v, DSP_SLIDER_HEIGHT, 0, 1.5), DSP_SLIDER_HEIGHT, 0, 1.5) - v),
      ).toBeLessThanOrEqual(0.01);
    }
  });

  it("dspYToValue tidak membulatkan: 0.75 tetap pecahan, bukan 1", () => {
    // Dulu Math.round di sini — rentang 0..1.5 akan terpotong jadi 0/1/2.
    const y = dspValueToY(0.75, DSP_SLIDER_HEIGHT, 0, 1.5);
    expect(dspYToValue(y, DSP_SLIDER_HEIGHT, 0, 1.5)).toBeCloseTo(0.75, 9);
  });
});
