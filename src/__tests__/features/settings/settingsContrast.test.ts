// FASE 3 Settings — kunci kontras di 4 tema (Noir / Ember / Porcelain /
// Hearth). Angka-angka di sini TERUKUR dari token tema asli (bukan
// perkiraan), mengikuti pola analyzerContrast.test.ts: test memanggil
// pickReadable/accentOn dengan daftar kandidat yang SAMA PERSIS seperti
// komponen, lalu mengunci rasionya.
//
// Cacat lama yang diperbaiki ronde ini (diukur dulu, lihat
// fase3-settings-report.md §4):
// - teks hint tertiary 10–11px: 3,94–4,39 di Hearth/Porcelain → secondary.
// - teks warning mentah: 3,69–4,27 di tema terang → pickReadable kuning.
// - teks error mentah: 3,57–4,33 di tema terang → pickReadable merah.
// - nama preset EQ aktif (accentOnSecondary di atas tint primary 18%):
//   4,15 Ember / 4,47 Hearth → text.primary.
// - teks tombol reset: status.error lolos di atas primary Porcelain
//   tapi hanya 3,92 di atas tint error 20% yang sama → pickReadable
//   terhadap kompositnya (compositeOver di contrast.ts).
import { ALL_THEMES, WARM_DEFAULT_THEME_IDS } from "@/shared/constants/theme";
import {
  contrastRatio,
  accentOn,
  pickReadable,
  compositeOver,
  AA_NORMAL,
  AA_LARGE,
} from "@/shared/utils/contrast";

const ratio = (fg: string | undefined, bg: string | undefined): number =>
  contrastRatio(fg, bg) ?? 0;

const THEME_IDS = [
  "pristine-noir",
  "pristine-ember",
  "pristine-porcelain",
  "pristine-hearth",
] as const;

type StatusColors = {
  status: { warning?: string; error: string };
};

// Daftar kandidat yang SAMA PERSIS seperti settings.tsx — bila komponen
// berubah, test ini harus ikut berubah (itu gunanya: mengunci pasangan).
const WARN_CANDIDATES = (c: StatusColors) => [
  c.status.warning,
  "#92400E",
  "#78350F",
];
const ERROR_CANDIDATES = (c: StatusColors) => [
  c.status.error,
  "#B91C1C",
  "#991B1B",
];

describe("settings contrast (4 tema)", () => {
  it.each(THEME_IDS)("hint/label secondary di atas secondary + tertiary: %s", (id) => {
    const c = ALL_THEMES[id].colors;
    // Hint 10–11px + label 12px (dulu tertiary 3,94–4,39 di Hearth).
    expect(ratio(c.text.secondary, c.background.secondary)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(ratio(c.text.secondary, c.background.tertiary)).toBeGreaterThanOrEqual(AA_NORMAL);
    // Label utama.
    expect(ratio(c.text.primary, c.background.secondary)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(ratio(c.text.primary, c.background.tertiary)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it.each(THEME_IDS)("teks warning terbaca (pickReadable kuning): %s", (id) => {
    const c = ALL_THEMES[id].colors;
    // "Perangkat diminta..." di atas secondary; pathLabel fallback di atas
    // kotak tertiary. Hue tetap kuning (kandidat pertama = status.warning
    // di tema gelap, #92400E di tema terang).
    for (const surface of [c.background.secondary, c.background.tertiary]) {
      const picked = pickReadable(WARN_CANDIDATES(c), surface, AA_NORMAL);
      expect(picked).toBeDefined();
      expect(WARN_CANDIDATES(c)).toContain(picked);
      expect(ratio(picked, surface)).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it.each(THEME_IDS)("teks error terbaca (pickReadable merah): %s", (id) => {
    const c = ALL_THEMES[id].colors;
    // Teks "Kosongkan Cache" di atas secondary; teks alertBox di atas
    // tint error 20% (komposit); teks + ikon tombol reset di atas tint
    // error 20% di atas primary. Hue tetap merah (kandidat pertama =
    // status.error di tema gelap, #B91C1C di tema terang).
    const onSecondary = pickReadable(ERROR_CANDIDATES(c), c.background.secondary, AA_NORMAL);
    expect(onSecondary).toBeDefined();
    expect(ERROR_CANDIDATES(c)).toContain(onSecondary);
    expect(ratio(onSecondary, c.background.secondary)).toBeGreaterThanOrEqual(AA_NORMAL);
    // Teks alertBox di atas tint error 20% (komposit di atas secondary).
    expect(
      ratio(onSecondary, compositeOver(c.status.error + "20", c.background.secondary)),
    ).toBeGreaterThanOrEqual(AA_NORMAL);
    // Teks + ikon tombol reset: pickReadable yang SAMA PERSIS seperti
    // komponen — diukur terhadap komposit tint di atas primary, bukan
    // terhadap primary di bawahnya (status.error lolos di atas primary
    // Porcelain tapi hanya 3,92 di atas kompositnya).
    const onResetBg = pickReadable(
      ERROR_CANDIDATES(c),
      compositeOver(c.status.error + "20", c.background.primary),
      AA_NORMAL,
    );
    expect(onResetBg).toBeDefined();
    expect(ERROR_CANDIDATES(c)).toContain(onResetBg);
    expect(
      ratio(onResetBg, compositeOver(c.status.error + "20", c.background.primary)),
    ).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it.each(THEME_IDS)("aksen terukur di atas permukaan: %s", (id) => {
    const c = ALL_THEMES[id].colors;
    // Ikon/label aksen (accentOn) + teks di atas tombol primary[500].
    const accSec = accentOn([c.primary[500]], c.background.secondary, [
      c.text.primary,
      c.text.secondary,
    ]);
    expect(ratio(accSec, c.background.secondary)).toBeGreaterThanOrEqual(AA_NORMAL);
    const accTer = accentOn([c.primary[500]], c.background.tertiary, [
      c.text.primary,
      c.text.secondary,
    ]);
    expect(ratio(accTer, c.background.tertiary)).toBeGreaterThanOrEqual(AA_NORMAL);
    const accPri = accentOn([c.primary[500]], c.background.primary, [
      c.text.primary,
      c.text.secondary,
    ]);
    expect(ratio(accPri, c.background.primary)).toBeGreaterThanOrEqual(AA_NORMAL);
    const onAccent =
      pickReadable(
        [c.text.inverse, c.background.primary, c.text.primary],
        c.primary[500],
        AA_NORMAL,
      ) ?? "?";
    expect(ratio(onAccent, c.primary[500])).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it.each(THEME_IDS)("nama preset EQ aktif (text.primary di atas tint 18%%): %s", (id) => {
    const c = ALL_THEMES[id].colors;
    // Dulu accentOnSecondary di atas tint: 4,15 Ember / 4,47 Hearth.
    expect(
      ratio(c.text.primary, compositeOver(c.primary[500] + "18", c.background.secondary)),
    ).toBeGreaterThanOrEqual(AA_NORMAL);
    // Ikon centang tetap accentOnSecondary (pemakaian ikon, ambang 3,0).
    const accSec = accentOn([c.primary[500]], c.background.secondary, [
      c.text.primary,
      c.text.secondary,
    ]);
    expect(
      ratio(accSec, compositeOver(c.primary[500] + "18", c.background.secondary)),
    ).toBeGreaterThanOrEqual(AA_LARGE);
  });

  it.each(THEME_IDS)("ThemePicker terbaca: %s", (id) => {
    const c = ALL_THEMES[id].colors;
    // Judul 20px, kategori 13px caps, nama kartu 12px, teks "Acak Tema".
    expect(ratio(c.text.primary, c.background.primary)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(ratio(c.text.secondary, c.background.primary)).toBeGreaterThanOrEqual(AA_NORMAL);
    const accPri = accentOn([c.primary[500]], c.background.primary, [
      c.text.primary,
      c.text.secondary,
    ]);
    expect(ratio(accPri, c.background.primary)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it("badge Bawaan + pasangan hangat terdaftar", () => {
    // Pasangan bawaan = persis dua tema yang dipakai ThemeContext untuk
    // instalasi baru (sistem terang → hearth, gelap → ember).
    expect([...WARM_DEFAULT_THEME_IDS].sort()).toEqual(
      ["pristine-ember", "pristine-hearth"].sort(),
    );
    for (const cardId of WARM_DEFAULT_THEME_IDS) {
      const card = ALL_THEMES[cardId];
      expect(card).toBeDefined();
      // Teks badge (putih/hitam terukur) di atas primary[500] kartu itu.
      const on =
        pickReadable(["#FFFFFF", "#000000"], card.colors.primary[500], AA_NORMAL) ?? "?";
      expect(ratio(on, card.colors.primary[500])).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });
});
