// src/__tests__/features/equalizer/solfeggioTemplates.test.ts
import {
  CUSTOM_TEMPLATE_ID,
  DEFAULT_SOLFEGEGGIO_FREQ,
  DEFAULT_SOLFEGEGGIO_TEMPLATE_ID,
  SOLFEGGIO_FREQ_MAX,
  SOLFEGGIO_FREQ_MIN,
  SOLFEGGIO_TEMPLATES,
  activeSolfeggioTemplateId,
  clampSolfeggioFreq,
  getSolfeggioTemplate,
  matchSolfeggioTemplate,
} from "@/features/equalizer/api/solfeggioTemplates";

describe("SOLFEGGIO_TEMPLATES", () => {
  it("lengkap: 7 template, id unik", () => {
    expect(SOLFEGGIO_TEMPLATES).toHaveLength(7);
    const ids = SOLFEGGIO_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(7);
  });

  it("frekuensi sesuai daftar: 396/417/528/639/741/852/963", () => {
    expect(SOLFEGGIO_TEMPLATES.map((t) => t.freq)).toEqual([
      396, 417, 528, 639, 741, 852, 963,
    ]);
  });

  it("intensitas default 0,5 — kecuali 963 (0,4)", () => {
    for (const t of SOLFEGGIO_TEMPLATES) {
      expect(t.intensity).toBe(t.id === "963" ? 0.4 : 0.5);
    }
  });

  it("asosiasi ditulis sebagai atribusi tradisional, tanpa klaim medis", () => {
    for (const t of SOLFEGGIO_TEMPLATES) {
      expect(t.association).toMatch(/secara tradisional dikaitkan/i);
      expect(t.association.toLowerCase()).not.toMatch(
        /menyembuhkan|mengobati|terapi|khasiat|manfaat kesehatan/,
      );
    }
  });
});

describe("default", () => {
  it("default = fokus / 528 Hz (sama dengan default engine)", () => {
    expect(DEFAULT_SOLFEGEGGIO_TEMPLATE_ID).toBe("fokus");
    expect(DEFAULT_SOLFEGEGGIO_FREQ).toBe(528);
    expect(getSolfeggioTemplate(DEFAULT_SOLFEGEGGIO_TEMPLATE_ID)?.freq).toBe(
      DEFAULT_SOLFEGEGGIO_FREQ,
    );
  });
});

describe("clampSolfeggioFreq", () => {
  it("menjepit ke 100–2000 Hz", () => {
    expect(clampSolfeggioFreq(50)).toBe(SOLFEGGIO_FREQ_MIN);
    expect(clampSolfeggioFreq(5000)).toBe(SOLFEGGIO_FREQ_MAX);
    expect(clampSolfeggioFreq(528)).toBe(528);
  });

  it("non-finite -> default 528", () => {
    expect(clampSolfeggioFreq(NaN)).toBe(DEFAULT_SOLFEGEGGIO_FREQ);
    expect(clampSolfeggioFreq(Infinity)).toBe(DEFAULT_SOLFEGEGGIO_FREQ);
  });
});

describe("matchSolfeggioTemplate / activeSolfeggioTemplateId", () => {
  it("pasangan persis tiap template cocok", () => {
    for (const t of SOLFEGGIO_TEMPLATES) {
      expect(matchSolfeggioTemplate(t.freq, t.intensity)?.id).toBe(t.id);
      expect(activeSolfeggioTemplateId(t.freq, t.intensity)).toBe(t.id);
    }
  });

  it("intensitas diubah setelah pilih template -> Kustom", () => {
    expect(matchSolfeggioTemplate(528, 0.8)).toBeNull();
    expect(activeSolfeggioTemplateId(528, 0.8)).toBe(CUSTOM_TEMPLATE_ID);
  });

  it("frekuensi diubah setelah pilih template -> Kustom", () => {
    expect(matchSolfeggioTemplate(600, 0.5)).toBeNull();
    expect(activeSolfeggioTemplateId(600, 0.5)).toBe(CUSTOM_TEMPLATE_ID);
  });

  it("toleransi kecil untuk intensitas hasil slider (0,4 ≈ 0,4000000001)", () => {
    expect(matchSolfeggioTemplate(963, 0.4000000001)?.id).toBe("963");
  });

  it("getSolfeggioTemplate: id tak dikenal -> undefined", () => {
    expect(getSolfeggioTemplate("tidak-ada")).toBeUndefined();
  });
});
