import {
  createFlatEQ,
  validateEQGain,
  dbToLinear,
  linearToDb,
  getNativeReverbPreset,
  REVERB_PRESET_MAP,
  type ReverbPreset,
} from "../../../shared/types/dsp";

describe("createFlatEQ", () => {
  it("default 10 band", () => {
    const bands = createFlatEQ();
    expect(bands).toHaveLength(10);
    expect(bands.every((b) => b.gain === 0)).toBe(true);
  });

  it("5 band memakai frekuensi yang benar", () => {
    expect(createFlatEQ(5).map((b) => b.frequency)).toEqual([
      60, 230, 910, 3600, 14000,
    ]);
  });

  it("10 band memakai frekuensi yang benar", () => {
    expect(createFlatEQ(10).map((b) => b.frequency)).toEqual([
      32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000,
    ]);
  });

  it("semua band q=1.0 dan type=peaking", () => {
    const bands = createFlatEQ();
    expect(bands.every((b) => b.q === 1.0 && b.type === "peaking")).toBe(true);
  });

  it("bandCount selain 5 dianggap 10 band", () => {
    expect(createFlatEQ(7)).toHaveLength(10);
  });
});

describe("validateEQGain", () => {
  it("clamp ke rentang -12..12", () => {
    expect(validateEQGain(0)).toBe(0);
    expect(validateEQGain(12)).toBe(12);
    expect(validateEQGain(-12)).toBe(-12);
    expect(validateEQGain(99)).toBe(12);
    expect(validateEQGain(-99)).toBe(-12);
  });
});

describe("dbToLinear / linearToDb", () => {
  it("0 dB = 1.0 linear", () => {
    expect(dbToLinear(0)).toBeCloseTo(1.0, 10);
  });

  it("nilai acuan umum", () => {
    expect(dbToLinear(6)).toBeCloseTo(1.9952623, 6);
    expect(dbToLinear(-6)).toBeCloseTo(0.5011872, 6);
    expect(dbToLinear(20)).toBeCloseTo(10, 10);
    expect(dbToLinear(-20)).toBeCloseTo(0.1, 10);
  });

  it("linearToDb adalah invers dbToLinear", () => {
    for (const db of [-20, -6, -1, 0, 1, 6, 20]) {
      expect(linearToDb(dbToLinear(db))).toBeCloseTo(db, 10);
    }
  });

  it("dbToLinear(-Infinity) = 0 (senyap total)", () => {
    expect(dbToLinear(-Infinity)).toBe(0);
  });

  it("dbToLinear(NaN) menghasilkan NaN, bukan crash", () => {
    expect(Number.isNaN(dbToLinear(NaN))).toBe(true);
  });
});

describe("getNativeReverbPreset", () => {
  it("memetakan setiap preset ke angka Android PresetReverb", () => {
    for (const [preset, expected] of Object.entries(REVERB_PRESET_MAP)) {
      expect(getNativeReverbPreset(preset as ReverbPreset)).toBe(expected);
    }
  });

  it("preset tidak dikenal jatuh ke 0 (none)", () => {
    expect(getNativeReverbPreset("tidak-ada" as ReverbPreset)).toBe(0);
  });

  it("none = 0 dan plate = 6", () => {
    expect(getNativeReverbPreset("none")).toBe(0);
    expect(getNativeReverbPreset("plate")).toBe(6);
  });
});
