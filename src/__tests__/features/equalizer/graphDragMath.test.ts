// src/__tests__/features/equalizer/graphDragMath.test.ts
import { bandPoint, pointToBand } from "@/features/equalizer/api/graphDragMath";

// Geometri yang sama dengan FrequencyGraph: lebar 340, tinggi 140,
// 10 band -> stepX = 340/9, midY = 70, verticalScale = 140*0.45/10 = 6.3.
const WIDTH = 340;
const HEIGHT = 140;
const BANDS = 10;

describe("pointToBand", () => {
  it("x di tengah band -> band itu", () => {
    for (let i = 0; i < BANDS; i++) {
      const x = (i * WIDTH) / (BANDS - 1);
      expect(pointToBand(x, 70, WIDTH, HEIGHT, BANDS).index).toBe(i);
    }
  });

  it("x di antara dua band -> band terdekat", () => {
    const stepX = WIDTH / (BANDS - 1);
    expect(pointToBand(stepX * 1.4, 70, WIDTH, HEIGHT, BANDS).index).toBe(1);
    expect(pointToBand(stepX * 1.6, 70, WIDTH, HEIGHT, BANDS).index).toBe(2);
  });

  it("y di midY -> 0 dB", () => {
    expect(pointToBand(0, 70, WIDTH, HEIGHT, BANDS).gain).toBe(0);
    expect(pointToBand(200, 70, WIDTH, HEIGHT, BANDS).gain).toBe(0);
  });

  it("y di atas/bawah dijepit ke ±10", () => {
    // y=0 (puncak canvas) -> +11.1 dB mentah -> dijepit +10.
    expect(pointToBand(0, 0, WIDTH, HEIGHT, BANDS).gain).toBe(10);
    // y=140 (dasar canvas) -> -11.1 dB mentah -> dijepit -10.
    expect(pointToBand(0, 140, WIDTH, HEIGHT, BANDS).gain).toBe(-10);
    // Jauh di luar canvas pun tetap ±10.
    expect(pointToBand(0, -100, WIDTH, HEIGHT, BANDS).gain).toBe(10);
    expect(pointToBand(0, 300, WIDTH, HEIGHT, BANDS).gain).toBe(-10);
  });

  it("x di luar rentang dijepit ke band pertama/terakhir", () => {
    expect(pointToBand(-50, 70, WIDTH, HEIGHT, BANDS).index).toBe(0);
    expect(pointToBand(999, 70, WIDTH, HEIGHT, BANDS).index).toBe(BANDS - 1);
  });

  it("pembulatan ke 0.1 dB", () => {
    // verticalScale 6.3: y = 49 -> gain 21/6.3 = 3.333... -> 3.3.
    expect(pointToBand(0, 49, WIDTH, HEIGHT, BANDS).gain).toBe(3.3);
    // y = 82.6 -> gain -12.6/6.3 = -2.0.
    expect(pointToBand(0, 82.6, WIDTH, HEIGHT, BANDS).gain).toBe(-2);
  });

  it("gain negatif kecil dibulatkan ke 0, bukan -0", () => {
    // y sedikit di bawah midY -> gain mentah -0.04 -> dibulatkan -0 -> 0.
    expect(pointToBand(0, 70.25, WIDTH, HEIGHT, BANDS).gain).toBe(0);
    expect(
      Object.is(pointToBand(0, 70.25, WIDTH, HEIGHT, BANDS).gain, -0),
    ).toBe(false);
  });

  it("0 band / koordinat NaN -> aman, tanpa NaN lolos", () => {
    expect(pointToBand(10, 70, WIDTH, HEIGHT, 0)).toEqual({
      index: 0,
      gain: 0,
    });
    expect(pointToBand(NaN, 70, WIDTH, HEIGHT, BANDS)).toEqual({
      index: 0,
      gain: 0,
    });
    expect(pointToBand(10, NaN, WIDTH, HEIGHT, BANDS)).toEqual({
      index: 0,
      gain: 0,
    });
  });
});

describe("bandPoint", () => {
  it("kebalikan pointToBand di titik band", () => {
    for (let i = 0; i < BANDS; i++) {
      const pt = bandPoint(i, 0, WIDTH, HEIGHT, BANDS);
      expect(pt.y).toBe(70);
      expect(pointToBand(pt.x, pt.y, WIDTH, HEIGHT, BANDS).index).toBe(i);
    }
  });

  it("gain +10 di atas midY, -10 di bawah midY", () => {
    // verticalScale 6.3: ±10 dB = ±63 px dari midY.
    expect(bandPoint(0, 10, WIDTH, HEIGHT, BANDS).y).toBeCloseTo(70 - 63, 9);
    expect(bandPoint(0, -10, WIDTH, HEIGHT, BANDS).y).toBeCloseTo(70 + 63, 9);
  });
});
