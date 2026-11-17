// src/__tests__/features/visualizer/analyzerSpectrum.test.ts
import {
  ANALYZER_BIN_COUNT,
  ANALYZER_DB_CEIL,
  ANALYZER_DB_FLOOR,
  PARAMETRIC_COLOR_BLUE,
  PARAMETRIC_COLOR_CYAN,
  PARAMETRIC_COLOR_GREEN,
  PARAMETRIC_COLOR_ORANGE,
  PARAMETRIC_COLOR_RED,
  PARAMETRIC_COLOR_YELLOW,
  binCenterFreq,
  dbColor,
  dbToValue,
  dbZone,
  dominantBin,
  formatFreq,
  freqLabelsFor,
  freqToFraction,
  parametricDbColor,
  parametricDbZone,
  valueToDb,
} from "@/features/visualizer/api/analyzerSpectrum";

describe("binCenterFreq", () => {
  it("bin pertama di sekitar 20 Hz dan bin terakhir di sekitar 24 kHz", () => {
    expect(binCenterFreq(0)).toBeGreaterThan(20);
    expect(binCenterFreq(0)).toBeLessThan(30);
    expect(binCenterFreq(ANALYZER_BIN_COUNT - 1)).toBeGreaterThan(10000);
    expect(binCenterFreq(ANALYZER_BIN_COUNT - 1)).toBeLessThan(24000);
  });

  it("monoton naik", () => {
    let prev = 0;
    for (let b = 0; b < ANALYZER_BIN_COUNT; b++) {
      const f = binCenterFreq(b);
      expect(f).toBeGreaterThan(prev);
      prev = f;
    }
  });

  it("bin tengah di sekitar 700 Hz (tengah log 20 Hz–24 kHz)", () => {
    // sqrt(20 * 24000) = ~693 Hz
    const mid = binCenterFreq(64);
    expect(mid).toBeGreaterThan(500);
    expect(mid).toBeLessThan(900);
  });

  it("freqMax 22050 (stream 44,1 kHz): bin terakhir di bawah 22050", () => {
    expect(binCenterFreq(ANALYZER_BIN_COUNT - 1, 128, 22050)).toBeLessThan(
      22050,
    );
    expect(binCenterFreq(0, 128, 22050)).toBeGreaterThan(20);
  });
});

describe("freqToFraction", () => {
  it("20 Hz -> 0, 24 kHz -> 1", () => {
    expect(freqToFraction(20)).toBeCloseTo(0, 9);
    expect(freqToFraction(24000)).toBeCloseTo(1, 9);
  });

  it("693 Hz (tengah geometris) -> 0.5", () => {
    expect(freqToFraction(Math.sqrt(20 * 24000))).toBeCloseTo(0.5, 9);
  });

  it("dijepit di luar rentang", () => {
    expect(freqToFraction(5)).toBe(0);
    expect(freqToFraction(100000)).toBe(1);
  });

  it("freqMax 22050: 22050 -> 1, 24000 dijepit ke 1", () => {
    expect(freqToFraction(22050, 22050)).toBeCloseTo(1, 9);
    expect(freqToFraction(24000, 22050)).toBe(1);
    expect(freqToFraction(Math.sqrt(20 * 22050), 22050)).toBeCloseTo(0.5, 9);
  });
});

describe("freqLabelsFor", () => {
  it("24 kHz: label kanonik + 24 kHz di ujung", () => {
    expect(freqLabelsFor(24000)).toEqual([
      20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 24000,
    ]);
  });

  it("22050: label di atas 22050 dibuang, 22050 jadi ujung", () => {
    const labels = freqLabelsFor(22050);
    expect(labels[labels.length - 1]).toBe(22050);
    expect(labels).not.toContain(24000);
  });

  it("freqMax sudah di daftar: tidak diduplikasi", () => {
    expect(freqLabelsFor(20000)).toEqual([
      20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000,
    ]);
  });
});

describe("valueToDb / dbToValue", () => {
  it("0 -> lantai (-80), 1 -> langit (0, full scale)", () => {
    expect(valueToDb(0)).toBe(ANALYZER_DB_FLOOR);
    expect(valueToDb(1)).toBe(ANALYZER_DB_CEIL);
    expect(ANALYZER_DB_CEIL).toBe(0);
    expect(dbToValue(-80)).toBe(0);
    expect(dbToValue(0)).toBe(1);
  });

  it("bolak-balik konsisten", () => {
    for (const v of [0, 0.25, 0.5, 0.75, 1]) {
      expect(dbToValue(valueToDb(v))).toBeCloseTo(v, 9);
    }
    for (const db of [-80, -60, -45, -20, 0]) {
      expect(valueToDb(dbToValue(db))).toBeCloseTo(db, 9);
    }
  });
});

describe("dbZone / dbColor", () => {
  it("hijau di bawah -12, kuning -12..-3, merah >= -3", () => {
    expect(dbZone(-80)).toBe("low");
    expect(dbZone(-13)).toBe("low");
    expect(dbZone(-12)).toBe("warn");
    expect(dbZone(-4)).toBe("warn");
    expect(dbZone(-3)).toBe("clip");
    expect(dbZone(0)).toBe("clip");
  });

  it("warna konsisten dengan zona", () => {
    expect(dbColor(-40)).toBe("#22C55E");
    expect(dbColor(-6)).toBe("#EAB308");
    expect(dbColor(-1)).toBe("#EF4444");
  });
});

describe("formatFreq", () => {
  it("Hz di bawah 1 kHz", () => {
    expect(formatFreq(20)).toBe("20 Hz");
    expect(formatFreq(440)).toBe("440 Hz");
    expect(formatFreq(999)).toBe("999 Hz");
  });

  it("kHz di atas 1 kHz", () => {
    expect(formatFreq(1000)).toBe("1 kHz");
    expect(formatFreq(1200)).toBe("1.2 kHz");
    expect(formatFreq(10000)).toBe("10 kHz");
    expect(formatFreq(20000)).toBe("20 kHz");
  });
});

describe("dominantBin", () => {
  it("mengembalikan indeks nilai terbesar", () => {
    expect(dominantBin([0.1, 0.5, 0.3])).toBe(1);
    expect(dominantBin([0.9, 0.1])).toBe(0);
  });

  it("-1 untuk data kosong atau semua nol", () => {
    expect(dominantBin([])).toBe(-1);
    expect(dominantBin([0, 0, 0])).toBe(-1);
  });

  it("upto membatasi pencarian ke bin yang tampil (E)", () => {
    // Puncak di bin 3, tapi di luar jangkauan upto=3.
    expect(dominantBin([0.1, 0.5, 0.3, 0.9], 3)).toBe(1);
    expect(dominantBin([0.1, 0.5, 0.3, 0.9], 4)).toBe(3);
    // upto di luar panjang data = seluruh data.
    expect(dominantBin([0.1, 0.5], 99)).toBe(1);
  });
});

describe("parametricDbZone / parametricDbColor (biru→merah, main player)", () => {
  it("zona mengikuti ambang dB: biru < -60, cyan -60..-40, hijau -40..-20, kuning -20..-12, oranye -12..-3, merah >= -3", () => {
    expect(parametricDbZone(-80)).toBe("blue");
    expect(parametricDbZone(-61)).toBe("blue");
    expect(parametricDbZone(-60)).toBe("cyan");
    expect(parametricDbZone(-41)).toBe("cyan");
    expect(parametricDbZone(-40)).toBe("green");
    expect(parametricDbZone(-21)).toBe("green");
    expect(parametricDbZone(-20)).toBe("yellow");
    expect(parametricDbZone(-13)).toBe("yellow");
    expect(parametricDbZone(-12)).toBe("orange");
    expect(parametricDbZone(-4)).toBe("orange");
    expect(parametricDbZone(-3)).toBe("red");
    expect(parametricDbZone(0)).toBe("red");
  });

  it("warna konsisten dengan zona (hijau/kuning/merah sama dengan Analyzer)", () => {
    expect(parametricDbColor(-80)).toBe(PARAMETRIC_COLOR_BLUE);
    expect(parametricDbColor(-50)).toBe(PARAMETRIC_COLOR_CYAN);
    expect(parametricDbColor(-30)).toBe(PARAMETRIC_COLOR_GREEN);
    expect(parametricDbColor(-15)).toBe(PARAMETRIC_COLOR_YELLOW);
    expect(parametricDbColor(-6)).toBe(PARAMETRIC_COLOR_ORANGE);
    expect(parametricDbColor(0)).toBe(PARAMETRIC_COLOR_RED);
  });
});
