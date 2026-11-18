/**
 * A3 — regresi kontras panel solid layar Player.
 *
 * Isi layar Player duduk di atas gradien full-screen, sementara warna token
 * dirancang untuk background.primary (solid). Sejak A3, semua teks/ikon
 * (header, info lagu, progres, kontrol, audio info) berada di atas panel
 * solid background.primary, dan bar utilitas di atas background.secondary.
 *
 * Tes ini mengunci pasangan warna panel dengan token tema ASLI (bukan
 * angka salinan): bila ada tema yang mengubah token sampai pasangan panel
 * gagal, tes ini yang pertama memberi tahu.
 */
import { contrastRatio, accentOn } from "@/shared/utils/contrast";
import { PRISTINE_NOIR, PRISTINE_PORCELAIN } from "@/shared/constants/themes/pristine";
import { PRISTINE_EMBER } from "@/shared/constants/themes/warm";
import type { Theme } from "@/shared/constants/themes/types";

const BRAND_THEMES: Theme[] = [PRISTINE_NOIR, PRISTINE_EMBER, PRISTINE_PORCELAIN];

describe("Player A3 — kontras panel solid", () => {
  it.each(BRAND_THEMES)(
    "$name: teks di atas background.primary lolos 4.5:1",
    (theme) => {
      const bg = theme.colors.background.primary;
      const text = theme.colors.text;
      expect(contrastRatio(text.primary, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(text.secondary, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(text.tertiary, bg)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(BRAND_THEMES)(
    "$name: ikon aktif primary[500] di atas background.primary lolos 3:1",
    (theme) => {
      const bg = theme.colors.background.primary;
      expect(
        contrastRatio(theme.colors.primary[500], bg),
      ).toBeGreaterThanOrEqual(3);
    },
  );

  it.each(BRAND_THEMES)(
    "$name: teks badge mode (accentOn) di atas background.primary lolos 4.5:1",
    (theme) => {
      const bg = theme.colors.background.primary;
      const gold = accentOn(
        [theme.colors.accent.primary],
        bg,
        [theme.colors.text.primary],
      );
      expect(contrastRatio(gold, bg)).toBeGreaterThanOrEqual(4.5);
      // Jalur FALLBACK badge (error) juga harus lolos sebagai teks.
      expect(
        contrastRatio(theme.colors.status.error, bg),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(BRAND_THEMES)(
    "$name: ikon bar utilitas di atas background.secondary lolos 3:1",
    (theme) => {
      const bg2 = theme.colors.background.secondary;
      // iconColorDefault: gelap = textTertiary, terang = textSecondary.
      const icon = theme.isDark
        ? theme.colors.text.tertiary
        : theme.colors.text.secondary;
      expect(contrastRatio(icon, bg2)).toBeGreaterThanOrEqual(3);
    },
  );

  it.each(BRAND_THEMES)(
    "$name: chip speed/tuning (teks secondary di atas background.tertiary) lolos 4.5:1",
    (theme) => {
      expect(
        contrastRatio(
          theme.colors.text.secondary,
          theme.colors.background.tertiary,
        ),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("gradien Noir di titik terburuk memang gagal — panel yang memperbaiki, bukan warna", () => {
    // Sanity: tanpa panel, ikon header di atas blend gradien Noir @10%
    // (emas #C9A96A -> navy, blend sRGB ~#B69A63) hanya ~2.46:1.
    // Angka ini mengunci alasan A3: yang diperbaiki adalah latarnya.
    const noir = PRISTINE_NOIR;
    const blendAt10 = "#B69A63";
    expect(
      contrastRatio(noir.colors.text.primary, blendAt10),
    ).toBeLessThan(3);
    expect(
      contrastRatio(noir.colors.text.primary, noir.colors.background.primary),
    ).toBeGreaterThanOrEqual(4.5);
  });
});
