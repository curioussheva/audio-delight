// FASE 3 additional — kunci kontras layar detail lagu [id].tsx di 4 tema
// (Noir / Ember / Porcelain / Hearth). Angka-angka di sini TERUKUR dari
// token tema asli (bukan perkiraan), mengikuti pola settingsContrast.test.ts:
// test memanggil pickReadable/accentOn dengan daftar kandidat yang SAMA
// PERSIS seperti komponen, lalu mengunci rasionya.
//
// Cacat lama yang diperbaiki ronde ini (diukur dulu, lihat
// fase3-additional-report.md §1):
// - label DetailRow / label field edit / hint editor lirik (tertiary):
//   4,39 Hearth di atas secondary; 3,81 Noir di atas elevated → secondary.
// - nama artis (secondary opacity 0.7 di atas primary): 3,81 Porcelain /
//   3,89 Hearth → opacity dihapus (secondary penuh: 8,20–13,41).
// - teks "Hapus" lirik (status.error di atas secondary): 4,22 Porcelain /
//   4,33 Hearth → lolos setelah kartu pindah ke SectionCard (elevated).
// - judul seksi primary[500] di atas elevated: 3,78 Ember → accentOn
//   ([primary[500], accent.orange], jatuh ke teks bila tidak lolos).
// - ikon placeholder Music (text.disabled di atas tertiary): 1,84–2,55
//   → text.secondary.
import { ALL_THEMES } from "@/shared/constants/theme";
import {
  contrastRatio,
  accentOn,
  pickReadable,
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

// Daftar kandidat yang SAMA PERSIS seperti [id].tsx — bila komponen
// berubah, test ini harus ikut berubah (itu gunanya: mengunci pasangan).
const SECTION_TITLE_CANDIDATES = (c: {
  primary: { 500: string };
  accent: { orange: string };
}) => [c.primary[500], c.accent.orange];
const SECTION_TITLE_FALLBACKS = (c: {
  text: { primary: string; secondary: string };
}) => [c.text.primary, c.text.secondary];

describe("song detail [id].tsx contrast (4 tema)", () => {
  it.each(THEME_IDS)(
    "label baris detail / label field / hint editor (secondary di atas elevated): %s",
    (id) => {
      const c = ALL_THEMES[id].colors;
      // Label DetailRow (13px), label PristineTextInput (12px), hint
      // editor lirik (12px) — dulu tertiary (3,81 Noir / 4,39 Hearth).
      expect(ratio(c.text.secondary, c.background.elevated)).toBeGreaterThanOrEqual(
        AA_NORMAL,
      );
      // Nilai baris detail (14px) + bio lirik di atas kartu yang sama.
      expect(ratio(c.text.primary, c.background.elevated)).toBeGreaterThanOrEqual(
        AA_NORMAL,
      );
    },
  );

  it.each(THEME_IDS)(
    "judul seksi + ikonnya (accentOn amber di atas elevated): %s",
    (id) => {
      const c = ALL_THEMES[id].colors;
      // Panggilan yang SAMA PERSIS seperti komponen: amber dipertahankan
      // di mana lolos (Noir/Porcelain/Hearth = primary[500]), jatuh ke
      // accent.orange di Ember (6,68) — hue tetap amber di semua tema.
      const picked = accentOn(
        SECTION_TITLE_CANDIDATES(c),
        c.background.elevated,
        SECTION_TITLE_FALLBACKS(c),
      );
      expect([
        ...SECTION_TITLE_CANDIDATES(c),
        ...SECTION_TITLE_FALLBACKS(c),
      ]).toContain(picked);
      expect(ratio(picked, c.background.elevated)).toBeGreaterThanOrEqual(
        AA_NORMAL,
      );
      // Ikon seksi 16px memakai warna yang sama — ambang ikon 3:1.
      expect(ratio(picked, c.background.elevated)).toBeGreaterThanOrEqual(
        AA_LARGE,
      );
    },
  );

  it.each(THEME_IDS)(
    "nama artis (secondary penuh di atas primary): %s",
    (id) => {
      const c = ALL_THEMES[id].colors;
      // Dulu opacity 0.7 → 3,81 Porcelain / 3,89 Hearth. Tanpa opacity:
      // 8,20–13,41.
      expect(ratio(c.text.secondary, c.background.primary)).toBeGreaterThanOrEqual(
        AA_NORMAL,
      );
    },
  );

  it.each(THEME_IDS)(
    "penanda data belum lengkap (warning mentah di atas primary): %s",
    (id) => {
      const c = ALL_THEMES[id].colors;
      // Ikon + teks 13px — terukur lolos apa adanya (4,57–8,85), dikunci
      // supaya regresi ketahuan.
      expect(ratio(c.status.warning, c.background.primary)).toBeGreaterThanOrEqual(
        AA_NORMAL,
      );
    },
  );

  it.each(THEME_IDS)("tombol Hapus lirik (error di atas elevated): %s", (id) => {
    const c = ALL_THEMES[id].colors;
    // Dulu di atas secondary: 4,22 Porcelain / 4,33 Hearth. Di atas
    // SectionCard (elevated): 4,94–5,27.
    expect(ratio(c.status.error, c.background.elevated)).toBeGreaterThanOrEqual(
      AA_NORMAL,
    );
  });

  it.each(THEME_IDS)(
    "tombol Putar + badge sync (onPrimary di atas primary[500]): %s",
    (id) => {
      const c = ALL_THEMES[id].colors;
      // Panggilan yang SAMA PERSIS seperti komponen.
      const onPrimary =
        pickReadable(["#FFFFFF", "#000000"], c.primary[500], AA_NORMAL) ??
        "#FFFFFF";
      // Teks + ikon tombol Putar (onPrimary di atas primary[500]).
      expect(ratio(onPrimary, c.primary[500])).toBeGreaterThanOrEqual(
        AA_NORMAL,
      );
      // Badge "N kosong": teks primary[500] di atas onPrimary — rasio
      // simetris, ikut lolos.
      expect(ratio(c.primary[500], onPrimary)).toBeGreaterThanOrEqual(
        AA_NORMAL,
      );
    },
  );

  it.each(THEME_IDS)(
    "tombol Kembali cabang tidak ditemukan (primary[500] di atas secondary): %s",
    (id) => {
      const c = ALL_THEMES[id].colors;
      expect(ratio(c.primary[500], c.background.secondary)).toBeGreaterThanOrEqual(
        AA_NORMAL,
      );
    },
  );

  it.each(THEME_IDS)(
    "editor lirik (teks primer di atas tertiary) + ikon-ikon di atas elevated: %s",
    (id) => {
      const c = ALL_THEMES[id].colors;
      // Input editor lirik (teks primer di atas tertiary).
      expect(ratio(c.text.primary, c.background.tertiary)).toBeGreaterThanOrEqual(
        AA_NORMAL,
      );
      // Ikon batal edit (X, tertiary) + ikon simpan (Check, success) di
      // atas kartu — ambang ikon 3:1.
      expect(ratio(c.text.tertiary, c.background.elevated)).toBeGreaterThanOrEqual(
        AA_LARGE,
      );
      expect(ratio(c.status.success, c.background.elevated)).toBeGreaterThanOrEqual(
        AA_LARGE,
      );
      // Ikon placeholder Music (secondary di atas tertiary) — dulu
      // disabled: 1,84–2,55.
      expect(ratio(c.text.secondary, c.background.tertiary)).toBeGreaterThanOrEqual(
        AA_LARGE,
      );
    },
  );
});
