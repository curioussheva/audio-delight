// src/__tests__/features/equalizer/correctionResponse.test.ts
//
// Matematika kurva gabungan (koreksi + EQ): parser teks preset, respons
// biquad RBJ, dan penjumlahan dB. Murni — tanpa React Native / Skia.

import { BUILTIN_HEADPHONE_PRESETS } from "@/features/headphone/data/builtinPresets";
import {
  biquadMagnitudeDb,
  combinedCurveGains,
  correctionResponseDb,
  parseCorrectionPresetText,
} from "@/features/equalizer/api/correctionResponse";

const EQ_BAND_FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const flatBands = EQ_BAND_FREQUENCIES.map((frequency) => ({
  frequency,
  gain: 0,
}));

function kuntenPresetText(): string {
  const preset = BUILTIN_HEADPHONE_PRESETS.find(
    (p) => p.id === "builtin-gk-kunten",
  );
  if (!preset) throw new Error("preset Kunten tidak ditemukan");
  return preset.presetText;
}

describe("parseCorrectionPresetText", () => {
  it("membaca teks Kunten asli: 7 filter, preamp -8.2", () => {
    const parsed = parseCorrectionPresetText(kuntenPresetText());
    expect(parsed).not.toBeNull();
    expect(parsed?.preampDb).toBe(-8.2);
    expect(parsed?.filters).toHaveLength(7);
    expect(parsed?.filters[4]).toEqual({
      type: "peaking",
      freqHz: 5500,
      q: 0.6,
      gainDb: 6.0,
    });
  });

  it("membaca teks Cinematic: 5 filter, preamp -2.7", () => {
    const preset = BUILTIN_HEADPHONE_PRESETS.find(
      (p) => p.id === "builtin-gk-kunten-cinematic",
    );
    const parsed = parseCorrectionPresetText(preset?.presetText ?? "");
    expect(parsed?.preampDb).toBe(-2.7);
    expect(parsed?.filters).toHaveLength(5);
  });

  it("melewati filter OFF, alias tipe, satuan kHz, dan Q bawaan 0.707", () => {
    const parsed = parseCorrectionPresetText(
      [
        "Preamp: -3 dB",
        "Filter 1: OFF PK Fc 100 Hz Gain 9 dB Q 1.0",
        "Filter 2: ON PEAK Fc 1 kHz Gain 2 dB Q 1.5",
        "Filter 3: ON LS Fc 105 Hz Gain -1 dB Q 0.7",
        "Filter 4: ON HS Fc 10 kHz Gain 3 dB",
      ].join("\n"),
    );
    expect(parsed?.preampDb).toBe(-3);
    expect(parsed?.filters).toEqual([
      { type: "peaking", freqHz: 1000, q: 1.5, gainDb: 2 },
      { type: "lowshelf", freqHz: 105, q: 0.7, gainDb: -1 },
      { type: "highshelf", freqHz: 10000, q: 0.707, gainDb: 3 },
    ]);
  });

  it("mengabaikan baris preamp di luar ±40 dB, filter tetap terbaca", () => {
    const parsed = parseCorrectionPresetText(
      "Preamp: -99 dB\nFilter 1: ON PK Fc 1000 Hz Gain 2 dB Q 1.0",
    );
    expect(parsed?.preampDb).toBe(0);
    expect(parsed?.filters).toHaveLength(1);
  });

  it("gagal total (null) bila ada baris Filter yang tak terbaca", () => {
    expect(
      parseCorrectionPresetText(
        "Preamp: -2 dB\nFilter 1: ON PK Fc 1000 Hz Gain 2 dB Q 1.0\nFilter 2: ON XX Fc 500 Hz Gain 1 dB Q 1.0",
      ),
    ).toBeNull();
    expect(
      parseCorrectionPresetText(
        "Preamp: -2 dB\nFilter 1: ON PK Gain 2 dB Q 1.0",
      ),
    ).toBeNull();
    expect(
      parseCorrectionPresetText(
        "Preamp: -2 dB\nFilter 1: ON PK Fc 1000 Hz Gain 99 dB Q 1.0",
      ),
    ).toBeNull();
  });

  it("null bila tidak ada baris Filter atau >16 baris", () => {
    expect(parseCorrectionPresetText("Preamp: -2 dB\n")).toBeNull();
    expect(parseCorrectionPresetText("bukan preset")).toBeNull();
    const many = Array.from(
      { length: 17 },
      (_, i) => `Filter ${i + 1}: ON PK Fc 1000 Hz Gain 1 dB Q 1.0`,
    ).join("\n");
    expect(parseCorrectionPresetText(many)).toBeNull();
  });
});

describe("biquadMagnitudeDb", () => {
  it("peaking +6 dB tepat di Fc, ~0 dB jauh dari Fc", () => {
    expect(biquadMagnitudeDb("peaking", 1000, 1, 6, 1000)).toBeCloseTo(6, 1);
    expect(Math.abs(biquadMagnitudeDb("peaking", 1000, 1, 6, 100))).toBeLessThan(0.5);
    expect(Math.abs(biquadMagnitudeDb("peaking", 1000, 1, 6, 10000))).toBeLessThan(0.5);
  });

  it("lowshelf -6 dB di bawah Fc, ~0 dB jauh di atas Fc", () => {
    expect(biquadMagnitudeDb("lowshelf", 105, 0.7, -6, 31)).toBeCloseTo(-6, 0);
    expect(Math.abs(biquadMagnitudeDb("lowshelf", 105, 0.7, -6, 10000))).toBeLessThan(0.3);
  });

  it("highshelf +6 dB di atas Fc, ~0 dB jauh di bawah Fc", () => {
    expect(biquadMagnitudeDb("highshelf", 10000, 0.7, 6, 16000)).toBeCloseTo(6, 0);
    expect(Math.abs(biquadMagnitudeDb("highshelf", 10000, 0.7, 6, 100))).toBeLessThan(0.3);
  });

  it("input ekstrem tetap berhingga (tidak NaN)", () => {
    for (const v of [
      biquadMagnitudeDb("peaking", 0, 0, 100, 1000),
      biquadMagnitudeDb("lowshelf", 1e9, 100, -100, 16000),
      biquadMagnitudeDb("highshelf", 1000, 1, 6, 0),
      biquadMagnitudeDb("peaking", 1000, 1, 6, -50),
    ]) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });
});

describe("correctionResponseDb", () => {
  it("menjumlah dB dua filter pada frekuensi masing-masing", () => {
    const filters = [
      { type: "peaking" as const, freqHz: 1000, q: 1, gainDb: 4 },
      { type: "peaking" as const, freqHz: 4000, q: 1, gainDb: -2 },
    ];
    // Jumlah = jumlah magnitudo masing-masing (filter kedua ikut
    // menyumbang sedikit di 1000 Hz lewat ekornya — 3,87, bukan 4,00).
    expect(correctionResponseDb(filters, 1000)).toBeCloseTo(
      biquadMagnitudeDb("peaking", 1000, 1, 4, 1000) +
        biquadMagnitudeDb("peaking", 4000, 1, -2, 1000),
      9,
    );
    expect(correctionResponseDb(filters, 4000)).toBeCloseTo(
      biquadMagnitudeDb("peaking", 1000, 1, 4, 4000) +
        biquadMagnitudeDb("peaking", 4000, 1, -2, 4000),
      9,
    );
  });

  it("bentuk Kunten asli: boost di ~6 kHz, lubang di ~9 kHz, turun di 1,7 kHz", () => {
    const parsed = parseCorrectionPresetText(kuntenPresetText());
    const filters = parsed?.filters ?? [];
    expect(correctionResponseDb(filters, 6000)).toBeGreaterThan(4);
    // Lubang -7,8 dB di 8900 Hz terangkat sebagian oleh boost tetangga
    // (+5,3 dB di 6800 Hz) — tetap di bawah 0 dan di bawah puncak 6800 Hz.
    expect(correctionResponseDb(filters, 8900)).toBeLessThan(-1);
    expect(correctionResponseDb(filters, 8900)).toBeLessThan(
      correctionResponseDb(filters, 6800),
    );
    expect(correctionResponseDb(filters, 1700)).toBeLessThan(-1.5);
  });
});

describe("combinedCurveGains", () => {
  it("EQ + preamp + koreksi dijumlah per titik band", () => {
    const parsed = parseCorrectionPresetText(kuntenPresetText());
    expect(parsed).not.toBeNull();
    const bands = flatBands.map((b, i) => ({ ...b, gain: i === 5 ? 2 : 0 }));
    const combined = combinedCurveGains(bands, parsed);
    expect(combined).not.toBeNull();
    expect(combined).toHaveLength(10);
    for (let i = 0; i < 10; i++) {
      const expected =
        bands[i]?.gain +
        (parsed?.preampDb ?? 0) +
        correctionResponseDb(parsed?.filters ?? [], bands[i]?.frequency ?? 0);
      expect(combined?.[i]).toBeCloseTo(expected ?? 0, 9);
    }
  });

  it("null bila tidak ada koreksi atau tidak ada filter", () => {
    expect(combinedCurveGains(flatBands, null)).toBeNull();
    expect(
      combinedCurveGains(flatBands, { preampDb: -8.2, filters: [] }),
    ).toBeNull();
  });
});
