// src/__tests__/features/equalizer/graphClip.test.ts
import {
  BOOST_WARN_DB,
  cubicPoint,
  formatBoostDb,
  formatHzLabel,
  graphHzLabelIndices,
  sampleSmoothCurve,
  splitAboveZero,
  type CurveSample,
} from "@/features/equalizer/api/graphClip";

describe("cubicPoint", () => {
  it("t=0 -> p0, t=1 -> p3", () => {
    expect(cubicPoint(0, 10, 20, 30, 0)).toBe(0);
    expect(cubicPoint(0, 10, 20, 30, 1)).toBe(30);
  });

  it("tengah simetris -> 15", () => {
    expect(cubicPoint(0, 10, 20, 30, 0.5)).toBeCloseTo(15, 9);
  });
});

describe("sampleSmoothCurve", () => {
  it("gain datar 0 -> semua sampel gain 0", () => {
    const samples = sampleSmoothCurve([0, 0, 0], 300, 60, 4);
    expect(samples.length).toBeGreaterThan(0);
    for (const s of samples) expect(s.gain).toBeCloseTo(0, 9);
    expect(samples[0]?.x).toBe(0);
    expect(samples[samples.length - 1]?.x).toBeCloseTo(300, 9);
  });

  it("gain konstan +6 -> semua sampel +6", () => {
    const samples = sampleSmoothCurve([6, 6, 6], 300, 60, 4);
    for (const s of samples) expect(s.gain).toBeCloseTo(6, 9);
  });

  it("x monoton naik", () => {
    const samples = sampleSmoothCurve([-12, 0, 12, 0, -12], 300, 60, 4);
    let prev = -Infinity;
    for (const s of samples) {
      expect(s.x).toBeGreaterThanOrEqual(prev);
      prev = s.x;
    }
  });

  it("array kosong -> sampel kosong", () => {
    expect(sampleSmoothCurve([], 300, 60, 4)).toEqual([]);
  });
});

describe("splitAboveZero", () => {
  const mk = (gains: number[]): CurveSample[] =>
    gains.map((gain, i) => ({ x: i * 10, y: 0, gain }));

  it("semua <= 0 -> tidak ada run", () => {
    expect(splitAboveZero(mk([-12, 0, -3]))).toEqual({ warn: [], clip: [] });
  });

  it("gain 0..+6 masuk warn, > +6 masuk clip", () => {
    const { warn, clip } = splitAboveZero(mk([3, 6, 9, 12]));
    expect(warn).toHaveLength(1);
    expect(warn[0]?.length).toBe(2);
    expect(clip).toHaveLength(1);
    expect(clip[0]?.length).toBe(2);
  });

  it("run putus saat gain turun ke <= 0", () => {
    const { warn, clip } = splitAboveZero(mk([3, 3, -1, 3]));
    expect(warn).toHaveLength(2);
    expect(clip).toHaveLength(0);
  });

  it("batas tepat: 0 tidak masuk, 6 masuk warn", () => {
    const { warn, clip } = splitAboveZero(mk([0, 6, BOOST_WARN_DB]));
    expect(warn).toHaveLength(1);
    expect(warn[0]?.length).toBe(2);
    expect(clip).toHaveLength(0);
  });
});

describe("formatBoostDb", () => {
  it("bilangan bulat tanpa desimal", () => {
    expect(formatBoostDb(6)).toBe("+6 dB");
    expect(formatBoostDb(12)).toBe("+12 dB");
  });

  it("pecahan satu desimal", () => {
    expect(formatBoostDb(6.5)).toBe("+6.5 dB");
  });
});

describe("formatHzLabel", () => {
  it("di bawah 1 kHz tampil angka Hz", () => {
    expect(formatHzLabel(31)).toBe("31");
    expect(formatHzLabel(500)).toBe("500");
  });

  it("1 kHz ke atas tampil k", () => {
    expect(formatHzLabel(1000)).toBe("1k");
    expect(formatHzLabel(2000)).toBe("2k");
    expect(formatHzLabel(16000)).toBe("16k");
  });

  it("tidak valid -> 0", () => {
    expect(formatHzLabel(0)).toBe("0");
    expect(formatHzLabel(NaN)).toBe("0");
  });
});

describe("graphHzLabelIndices", () => {
  it("10 band -> [0, 2, 4, 6, 8, 9]", () => {
    expect(graphHzLabelIndices(10)).toEqual([0, 2, 4, 6, 8, 9]);
  });

  it("selalu sertakan band pertama dan terakhir", () => {
    expect(graphHzLabelIndices(5)).toEqual([0, 2, 4]);
    expect(graphHzLabelIndices(1)).toEqual([0]);
  });

  it("0 band -> kosong", () => {
    expect(graphHzLabelIndices(0)).toEqual([]);
  });
});
