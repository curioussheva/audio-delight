// src/__tests__/features/equalizer/brainwaveBands.test.ts
//
// Pita denyut binaural (2026-11-20): nilai yang dimainkan native adalah
// 2.5/6/10/18/40 Hz — BUKAN 20 untuk Beta (komentar AudioState.h C-P2
// menulis "Beta 20", generator memainkan 18,0 Hz).
import {
  BRAINWAVE_BANDS,
  BRAINWAVE_FREQ_MAX,
  DEFAULT_BRAINWAVE_FREQ,
  activeBrainwaveBandId,
  clampBrainwaveFreq,
  getBrainwaveBand,
  matchBrainwaveBand,
} from "@/features/equalizer/api/brainwaveBands";

describe("BRAINWAVE_BANDS", () => {
  it("lengkap: Mati + 5 pita, id unik", () => {
    expect(BRAINWAVE_BANDS).toHaveLength(6);
    const ids = BRAINWAVE_BANDS.map((b) => b.id);
    expect(new Set(ids).size).toBe(6);
  });

  it("frekuensi yang dimainkan native: 0/2.5/6/10/18/40 (Beta 18, bukan 20)", () => {
    expect(BRAINWAVE_BANDS.map((b) => b.freq)).toEqual([
      0, 2.5, 6, 10, 18, 40,
    ]);
  });

  it("asosiasi ditulis sebagai atribusi tradisional, tanpa klaim medis", () => {
    for (const b of BRAINWAVE_BANDS) {
      if (b.id === "mati") {
        expect(b.association).toBe("");
        continue;
      }
      expect(b.association).toMatch(/secara tradisional dikaitkan/i);
      expect(b.association.toLowerCase()).not.toMatch(
        /menyembuhkan|mengobati|terapi|khasiat|manfaat kesehatan/,
      );
    }
  });
});

describe("default", () => {
  it("default = mati / 0 Hz (sama dengan default engine)", () => {
    expect(DEFAULT_BRAINWAVE_FREQ).toBe(0);
    expect(getBrainwaveBand("mati")?.freq).toBe(DEFAULT_BRAINWAVE_FREQ);
    expect(activeBrainwaveBandId(0)).toBe("mati");
  });
});

describe("clampBrainwaveFreq", () => {
  it("menjepit ke 0–40 Hz", () => {
    expect(clampBrainwaveFreq(-5)).toBe(0);
    expect(clampBrainwaveFreq(50)).toBe(BRAINWAVE_FREQ_MAX);
    expect(clampBrainwaveFreq(10)).toBe(10);
  });

  it("non-finite -> default 0 (mati)", () => {
    expect(clampBrainwaveFreq(NaN)).toBe(DEFAULT_BRAINWAVE_FREQ);
    expect(clampBrainwaveFreq(Infinity)).toBe(DEFAULT_BRAINWAVE_FREQ);
  });
});

describe("matchBrainwaveBand / activeBrainwaveBandId", () => {
  it("nilai kanonis tiap pita cocok", () => {
    for (const b of BRAINWAVE_BANDS) {
      expect(matchBrainwaveBand(b.freq).id).toBe(b.id);
      expect(activeBrainwaveBandId(b.freq)).toBe(b.id);
    }
  });

  it("ambang sama dengan ImmersiveStage::mapFrequencyToBrainwaveType", () => {
    // <4 Delta, <8 Theta, <13 Alpha, <30 Beta, sisanya Gamma.
    expect(matchBrainwaveBand(3.9).id).toBe("delta");
    expect(matchBrainwaveBand(4).id).toBe("theta");
    expect(matchBrainwaveBand(7.9).id).toBe("theta");
    expect(matchBrainwaveBand(8).id).toBe("alpha");
    expect(matchBrainwaveBand(12.9).id).toBe("alpha");
    expect(matchBrainwaveBand(13).id).toBe("beta");
    expect(matchBrainwaveBand(29.9).id).toBe("beta");
    expect(matchBrainwaveBand(30).id).toBe("gamma");
  });

  it("nilai di luar pita kanonis tetap dipetakan ke yang memainkannya, bukan mati", () => {
    expect(matchBrainwaveBand(5).id).toBe("theta");
    expect(matchBrainwaveBand(20).id).toBe("beta");
  });

  it("getBrainwaveBand: id tak dikenal -> undefined", () => {
    expect(getBrainwaveBand("tidak-ada")).toBeUndefined();
  });
});
