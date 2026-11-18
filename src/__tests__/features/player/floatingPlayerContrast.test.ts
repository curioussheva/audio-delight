// FASE 3 additional — kunci kontras pill FloatingPlayer di 4 tema
// (Noir / Ember / Porcelain / Hearth). Angka-angka di sini TERUKUR dari
// token tema asli (bukan perkiraan), mengikuti pola
// settingsContrast.test.ts: test memanggil pickReadable dengan kandidat
// yang SAMA PERSIS seperti komponen, lalu mengunci rasionya.
//
// Hasil ukur sebelum ronde ini: semua warna pill sudah lolos tanpa
// perubahan — judul primary 11,82–18,13; artis secondary 7,40–10,12;
// badge HI-RES warning 4,98–6,68; ikon OFF tertiary 3,81–5,98
// (ambang ikon 3:1). Ronde ini hanya menyelaraskan tipografi
// (Inter bold/regular, bukan Playfair — lihat FloatingPlayer.tsx) dan
// mengunci kontrasnya supaya regresi ketahuan.
//
// Pasangan ON/OFF Shuffle/Repeat SUDAH dikunci di
// playerContrast.test.ts (3 tema) — sengaja tidak diduplikasi di sini.
import { ALL_THEMES } from "@/shared/constants/theme";
import {
  contrastRatio,
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

describe("FloatingPlayer contrast (4 tema)", () => {
  it.each(THEME_IDS)(
    "judul pill (primary di atas elevated): %s",
    (id) => {
      const c = ALL_THEMES[id].colors;
      // Judul 13px Inter bold, satu baris, ellipsis.
      expect(ratio(c.text.primary, c.background.elevated)).toBeGreaterThanOrEqual(
        AA_NORMAL,
      );
    },
  );

  it.each(THEME_IDS)(
    "nama artis (secondary di atas elevated): %s",
    (id) => {
      const c = ALL_THEMES[id].colors;
      expect(ratio(c.text.secondary, c.background.elevated)).toBeGreaterThanOrEqual(
        AA_NORMAL,
      );
    },
  );

  it.each(THEME_IDS)(
    "badge HI-RES (warning mentah di atas elevated): %s",
    (id) => {
      const c = ALL_THEMES[id].colors;
      // Badge 7px + border memakai status.warning mentah yang sama —
      // terukur lolos apa adanya (4,98–6,68), dipertahankan.
      expect(ratio(c.status.warning, c.background.elevated)).toBeGreaterThanOrEqual(
        AA_NORMAL,
      );
    },
  );

  it.each(THEME_IDS)(
    "ikon Skip + Shuffle/Repeat OFF (secondary di atas elevated): %s",
    (id) => {
      const c = ALL_THEMES[id].colors;
      // Ikon 18px — ambang ikon 3:1. Ikon OFF diukur 5,34–8,20 di layar
      // Player; di pill secondary yang sama dipakai untuk Skip.
      expect(ratio(c.text.secondary, c.background.elevated)).toBeGreaterThanOrEqual(
        AA_LARGE,
      );
    },
  );

  it.each(THEME_IDS)(
    "ikon Putar (pickReadable di atas primary[500]): %s",
    (id) => {
      const c = ALL_THEMES[id].colors;
      // Panggilan yang SAMA PERSIS seperti komponen (teks+tombol Play
      // memakai pickReadable yang sama).
      const onPrimary =
        pickReadable(["#FFFFFF", "#000000"], c.primary[500], AA_NORMAL) ??
        "#FFFFFF";
      expect(ratio(onPrimary, c.primary[500])).toBeGreaterThanOrEqual(
        AA_NORMAL,
      );
    },
  );
});
