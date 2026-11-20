// src/__tests__/features/replaygain/replaygain.test.ts
//
// Logika murni ReplayGain: parse nilai, clamp ±12 dB, peak cap, fallback
// album -> track, dan gain efektif (user × RG, di-clamp ke rentang master).

import {
  EFFECTIVE_GAIN_MAX,
  EFFECTIVE_GAIN_MIN,
  clampReplayGainDb,
  computeEffectiveMasterGain,
  dbToLinear,
  linearToDb,
  parseReplayGainDb,
  parseReplayGainPeak,
  replayGainLinearFor,
  resolveReplayGainDb,
  type ReplayGainTags,
} from "../../../features/replaygain/replaygain";

describe("parseReplayGainDb", () => {
  it("menerima '-6.23 dB'", () => {
    expect(parseReplayGainDb("-6.23 dB")).toBeCloseTo(-6.23);
  });
  it("menerima '+3 dB' dan '0'", () => {
    expect(parseReplayGainDb("+3 dB")).toBe(3);
    expect(parseReplayGainDb("0")).toBe(0);
  });
  it("menerima angka mentah dan koma desimal Eropa", () => {
    expect(parseReplayGainDb(-6.23)).toBe(-6.23);
    expect(parseReplayGainDb("-6,23 dB")).toBeCloseTo(-6.23);
  });
  it("menolak sampah / undefined / tak hingga", () => {
    expect(parseReplayGainDb("loud")).toBeNull();
    expect(parseReplayGainDb("")).toBeNull();
    expect(parseReplayGainDb(undefined)).toBeNull();
    expect(parseReplayGainDb(Number.POSITIVE_INFINITY)).toBeNull();
    expect(parseReplayGainDb("6.23 dB extra")).toBeNull();
  });
});

describe("parseReplayGainPeak", () => {
  it("menerima peak linear polos", () => {
    expect(parseReplayGainPeak("0.987")).toBeCloseTo(0.987);
    expect(parseReplayGainPeak(0.5)).toBe(0.5);
  });
  it("menerima peak bersufiks dB", () => {
    expect(parseReplayGainPeak("-0.11 dB")).toBeCloseTo(dbToLinear(-0.11));
  });
  it("menolak peak negatif / di luar 0..10", () => {
    expect(parseReplayGainPeak("-1")).toBeNull();
    expect(parseReplayGainPeak("99")).toBeNull();
  });
});

describe("clampReplayGainDb — batas ±12 dB", () => {
  it("nilai dalam rentang tidak berubah", () => {
    expect(clampReplayGainDb(-6.23)).toBeCloseTo(-6.23);
    expect(clampReplayGainDb(11.9)).toBeCloseTo(11.9);
  });
  it("nilai ekstrem dijepit ke ±12 (bukan dibuang)", () => {
    expect(clampReplayGainDb(-18.5)).toBe(-12);
    expect(clampReplayGainDb(15)).toBe(12);
    expect(clampReplayGainDb(Number.POSITIVE_INFINITY)).toBe(12);
    expect(clampReplayGainDb(Number.NEGATIVE_INFINITY)).toBe(-12);
  });
});

describe("resolveReplayGainDb — fallback album -> track", () => {
  const tags: ReplayGainTags = {
    trackGainDb: -6,
    albumGainDb: -2,
    trackPeak: 0.9,
    albumPeak: 0.8,
  };
  it("mode track memakai track gain + track peak", () => {
    expect(resolveReplayGainDb(tags, "track")).toEqual({
      gainDb: -6,
      peak: 0.9,
    });
  });
  it("mode album memakai album gain + album peak", () => {
    expect(resolveReplayGainDb(tags, "album")).toEqual({
      gainDb: -2,
      peak: 0.8,
    });
  });
  it("mode album tanpa tag album jatuh ke track", () => {
    expect(
      resolveReplayGainDb({ trackGainDb: -6, trackPeak: 0.9 }, "album"),
    ).toEqual({ gainDb: -6, peak: 0.9 });
  });
  it("tanpa tag apa pun -> null", () => {
    expect(resolveReplayGainDb({}, "track")).toBeNull();
    expect(resolveReplayGainDb(null, "track")).toBeNull();
  });
  it("gain di luar ±12 dijepit saat resolve", () => {
    expect(resolveReplayGainDb({ trackGainDb: -20 }, "track")).toEqual({
      gainDb: -12,
      peak: undefined,
    });
  });
});

describe("replayGainLinearFor — peak cap", () => {
  it("tanpa peak: -6 dB -> 10^(-6/20)", () => {
    expect(replayGainLinearFor({ trackGainDb: -6 }, "track")).toBeCloseTo(
      dbToLinear(-6),
    );
  });
  it("boost dibatasi peak: +10 dB dengan peak 0,99 -> maks 1/0,99", () => {
    const linear = replayGainLinearFor(
      { trackGainDb: 10, trackPeak: 0.99 },
      "track",
    );
    expect(linear).toBeCloseTo(1 / 0.99);
    expect(linear).toBeLessThan(dbToLinear(10));
  });
  it("cut tidak kena peak cap", () => {
    expect(
      replayGainLinearFor({ trackGainDb: -6, trackPeak: 0.99 }, "track"),
    ).toBeCloseTo(dbToLinear(-6));
  });
  it("tanpa tag -> null", () => {
    expect(replayGainLinearFor(null, "track")).toBeNull();
  });
});

describe("computeEffectiveMasterGain — user × RG, di-clamp", () => {
  it("RG mati -> gain user apa adanya", () => {
    expect(
      computeEffectiveMasterGain(1.2, { trackGainDb: -6 }, false, "track"),
    ).toBe(1.2);
  });
  it("tanpa tag -> gain user apa adanya", () => {
    expect(computeEffectiveMasterGain(1.2, null, true, "track")).toBe(1.2);
  });
  it("user 1,0 × RG -6 dB", () => {
    expect(
      computeEffectiveMasterGain(1.0, { trackGainDb: -6 }, true, "track"),
    ).toBeCloseTo(dbToLinear(-6));
  });
  it("hasil akhir dijepit ke rentang master (±12 dB)", () => {
    // user +12 dB (3,98×) × RG +12 dB -> mentok di batas atas.
    expect(
      computeEffectiveMasterGain(
        dbToLinear(12),
        { trackGainDb: 12 },
        true,
        "track",
      ),
    ).toBeCloseTo(EFFECTIVE_GAIN_MAX);
    // user -12 dB × RG -12 dB -> mentok di batas bawah.
    expect(
      computeEffectiveMasterGain(
        dbToLinear(-12),
        { trackGainDb: -12 },
        true,
        "track",
      ),
    ).toBeCloseTo(EFFECTIVE_GAIN_MIN);
  });
  it("mode album memakai album gain", () => {
    expect(
      computeEffectiveMasterGain(
        1.0,
        { trackGainDb: -6, albumGainDb: -2 },
        true,
        "album",
      ),
    ).toBeCloseTo(dbToLinear(-2));
  });
});

describe("dbToLinear / linearToDb — round-trip", () => {
  it("-12..+12 dB bolak-balik", () => {
    for (const db of [-12, -6.23, 0, 3.5, 12]) {
      expect(linearToDb(dbToLinear(db))).toBeCloseTo(db, 10);
    }
  });
});
