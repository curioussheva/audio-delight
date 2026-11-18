// FASE 3 Analyzer — kunci kontras layar Analyzer (tab Analyzer) di
// keempat tema. Pola sama dengan playerContrast/libraryContrast/
// equalizerContrast: pasangan teks-latar diukur dari token tema
// sungguhan, bukan angka contoh.
//
// Ukuran minimum yang dipakai:
// - Teks biasa/aksen: AA_NORMAL (4,5:1).
// - Teks redup (tertiary) di atas kartu: dikunci 3,0:1 — rentang
//   terukur 4,39–7,38 (Hearth 4,39, nyaris AA). Kandidat Fase 5,
//   sama seperti lock yang sama di ronde EQ.
// - Verdict 20px bold (statusValue) = teks BESAR WCAG (≥14pt bold),
//   ambang 3,0:1 — Porcelain success 4,39 / error 4,22 tetap lolos.
//
// Cacat lama yang diperbaiki ronde ini (terukur 2026-11-18, sebelum
// perbaikan):
// - Label sumbu #888888 (9px): 2,96–3,04 di tema terang (kini
//   text.secondary: 7,45–12,51).
// - Label "0 (maks)" #EF4444 (9px bold): 3,14–4,52 (kini pickReadable
//   merah: 5,40–6,51 — hue tetap merah di semua tema).
// - Teks disabled (sourceTag/bio/placeholder) di atas kartu: 2,07–2,76
//   — di bawah 3:1 (kini tertiary, dikunci 3:1 seperti ronde EQ).
// - Teks di atas pill gelap 45%: primary[500] 1,54–1,61 dan #888888
//   1,08–1,10 di tema terang — praktis tak terlihat (kini pill 65% +
//   teks putih: 7,68–20,12).
// - Pill CLIP (#EF4444 + teks putih): 3,76 (kini #DC2626: 4,83).
//
// Yang TIDAK berubah (batas keras): skala dBFS (-80..0), sumbu
// Nyquist, slider batas atas, warna zona ANALYZER_COLOR_* (hijau <
// -12, kuning -12..-3, merah >= -3 dB) — makna zona dikunci di
// analyzerSpectrum.test.ts dan ditegaskan lagi di sini.
import {
  contrastRatio,
  pickReadable,
  parseHex,
  AA_NORMAL,
  AA_LARGE,
} from "@/shared/utils/contrast";
import {
  ANALYZER_COLOR_CLIP,
  ANALYZER_COLOR_LOW,
  ANALYZER_COLOR_WARN,
} from "@/features/visualizer/api/analyzerSpectrum";
import {
  PRISTINE_NOIR,
  PRISTINE_PORCELAIN,
} from "@/shared/constants/themes/pristine";
import {
  PRISTINE_EMBER,
  PRISTINE_HEARTH,
} from "@/shared/constants/themes/warm";
import type { Theme } from "@/shared/constants/themes/types";

const THEMES: Theme[] = [
  PRISTINE_NOIR,
  PRISTINE_EMBER,
  PRISTINE_PORCELAIN,
  PRISTINE_HEARTH,
];

/** Komposit warna fg dengan alpha di atas bg (rgba(0,0,0,0.65) dll). */
const tintOver = (fg: string, bg: string, alpha: number): string => {
  const f = parseHex(fg);
  const b = parseHex(bg);
  if (!f || !b) throw new Error(`hex tidak terbaca: ${fg} / ${bg}`);
  const mix = (x: number, y: number) =>
    Math.round(x * alpha + y * (1 - alpha));
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return `#${h(mix(f.r, b.r))}${h(mix(f.g, b.g))}${h(mix(f.b, b.b))}`;
};

/** Opasitas pill gelap — HARUS sama dengan PILL_BG di AnalyzerSpectrum. */
const PILL_ALPHA = 0.65;
/** Latar pill CLIP — HARUS sama dengan CLIP_PILL_BG di AnalyzerSpectrum. */
const CLIP_PILL_BG = "#DC2626";

describe("FASE 3 Analyzer — kontras", () => {
  it.each(THEMES)(
    "label sumbu dB/Hz (9px): secondary di atas kartu ≥ 4,5 ($id)",
    (theme) => {
      const ratio = contrastRatio(
        theme.colors.text.secondary,
        theme.colors.background.secondary,
      );
      expect(ratio).not.toBeNull();
      expect(ratio!).toBeGreaterThanOrEqual(AA_NORMAL);
    },
  );

  it.each(THEMES)(
    "label seksi + caption dBFS (primary[500]) di atas kartu ≥ 4,5 ($id)",
    (theme) => {
      const ratio = contrastRatio(
        theme.colors.primary[500],
        theme.colors.background.secondary,
      );
      expect(ratio).not.toBeNull();
      expect(ratio!).toBeGreaterThanOrEqual(AA_NORMAL);
    },
  );

  it.each(THEMES)(
    "label '0 (maks)': pickReadable merah di atas kartu ≥ 4,5 ($id)",
    (theme) => {
      const cardBg = theme.colors.background.secondary;
      // Panggilan yang SAMA PERSIS seperti AnalyzerSpectrum — supaya
      // warna yang lolos ikut terkunci, bukan warna mentahnya.
      const picked = pickReadable(
        [theme.colors.status.error, ANALYZER_COLOR_CLIP, "#B91C1C"],
        cardBg,
      );
      expect(picked).toBeDefined();
      // Hue tetap merah: hasilnya salah satu dari tiga kandidat merah.
      expect([
        theme.colors.status.error,
        ANALYZER_COLOR_CLIP,
        "#B91C1C",
      ]).toContain(picked);
      const ratio = contrastRatio(picked, cardBg);
      expect(ratio).not.toBeNull();
      expect(ratio!).toBeGreaterThanOrEqual(AA_NORMAL);
    },
  );

  it.each(THEMES)(
    "label slider batas atas (secondary) di atas kartu ≥ 4,5 ($id)",
    (theme) => {
      const ratio = contrastRatio(
        theme.colors.text.secondary,
        theme.colors.background.secondary,
      );
      expect(ratio).not.toBeNull();
      expect(ratio!).toBeGreaterThanOrEqual(AA_NORMAL);
    },
  );

  it.each(THEMES)(
    "teks pill gelap: putih di atas pill 65% ≥ 4,5 ($id)",
    (theme) => {
      const pillBg = tintOver(
        "#000000",
        theme.colors.background.secondary,
        PILL_ALPHA,
      );
      const ratio = contrastRatio("#FFFFFF", pillBg);
      expect(ratio).not.toBeNull();
      expect(ratio!).toBeGreaterThanOrEqual(AA_NORMAL);
    },
  );

  it("pill CLIP: putih di atas #DC2626 ≥ 4,5", () => {
    const ratio = contrastRatio("#FFFFFF", CLIP_PILL_BG);
    expect(ratio).not.toBeNull();
    expect(ratio!).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it.each(THEMES)(
    "teks redup (tertiary) di atas kartu ≥ 3,0 — dikunci, Hearth 4,39 ($id)",
    (theme) => {
      const ratio = contrastRatio(
        theme.colors.text.tertiary,
        theme.colors.background.secondary,
      );
      expect(ratio).not.toBeNull();
      expect(ratio!).toBeGreaterThanOrEqual(AA_LARGE);
    },
  );

  it.each(THEMES)(
    "verdict 20px bold (teks besar): success/error/tertiary di atas kartu ≥ 3,0 ($id)",
    (theme) => {
      const cardBg = theme.colors.background.secondary;
      for (const fg of [
        theme.colors.status.success,
        theme.colors.status.error,
        theme.colors.text.tertiary,
      ]) {
        const ratio = contrastRatio(fg, cardBg);
        expect(ratio).not.toBeNull();
        expect(ratio!).toBeGreaterThanOrEqual(AA_LARGE);
      }
    },
  );

  it("zona warna Analyzer tidak berubah maknanya", () => {
    // Hijau < -12, kuning -12..-3, merah >= -3 dB (batas keras Fase 3).
    expect(ANALYZER_COLOR_LOW).toBe("#22C55E");
    expect(ANALYZER_COLOR_WARN).toBe("#EAB308");
    expect(ANALYZER_COLOR_CLIP).toBe("#EF4444");
  });
});
