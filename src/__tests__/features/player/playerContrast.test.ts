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
import {
  contrastRatio,
  accentOn,
  pickReadable,
  parseHex,
  AA_NORMAL,
} from "@/shared/utils/contrast";
import { PRISTINE_NOIR, PRISTINE_PORCELAIN } from "@/shared/constants/themes/pristine";
import { PRISTINE_EMBER } from "@/shared/constants/themes/warm";
import type { Theme } from "@/shared/constants/themes/types";

const BRAND_THEMES: Theme[] = [PRISTINE_NOIR, PRISTINE_EMBER, PRISTINE_PORCELAIN];

// Komposit tint alpha di atas background (rumus yang sama dengan
// hexToRGBA(color, alpha) di komponen). Dipakai blok A3 dan blok pill.
const tintOver = (fg: string, bg: string, alpha: number): string => {
  const f = parseHex(fg);
  const b = parseHex(bg);
  if (!f || !b) throw new Error("hex tidak terbaca");
  const mix = (x: number, y: number) =>
    Math.round(x * alpha + y * (1 - alpha));
  return `#${[mix(f.r, b.r), mix(f.g, b.g), mix(f.b, b.b)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`;
};

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

  // LAYOUT-V2 (2): label teks 4 item bar utilitas (teks secondary di
  // atas background.secondary) lolos 4.5:1 — label adalah teks 10px,
  // bukan ikon, jadi barnya 4.5:1 (bukan 3:1 seperti ikon).
  it.each(BRAND_THEMES)(
    "$name: label bar utilitas lolos 4.5:1",
    (theme) => {
      expect(
        contrastRatio(
          theme.colors.text.secondary,
          theme.colors.background.secondary,
        ),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );

  // LAYOUT-V2 (2): label AKTIF (primary[500], ikut warna ikon aktif)
  // di atas background.secondary juga harus lolos 4.5:1.
  it.each(BRAND_THEMES)(
    "$name: label aktif primary[500] di atas background.secondary lolos 4.5:1",
    (theme) => {
      expect(
        contrastRatio(
          theme.colors.primary[500],
          theme.colors.background.secondary,
        ),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );

  // LAYOUT-V2 (4): teks badge "1" Repeat One + teks badge sleep
  // ("12 mnt") — playIconColor di atas primary[500] lolos 4.5:1.
  // playIconColor dihitung pickReadable(["#FFFFFF","#000000"], primary)
  // di komponen, jadi lolos by construction; tes ini menguncinya.
  it.each(BRAND_THEMES)(
    "$name: teks badge di atas primary[500] lolos 4.5:1",
    (theme) => {
      const primary = theme.colors.primary[500];
      const badgeText =
        pickReadable(["#FFFFFF", "#000000"], primary, AA_NORMAL) ??
        "#FFFFFF";
      expect(contrastRatio(badgeText, primary)).toBeGreaterThanOrEqual(4.5);
    },
  );

  // ON/OFF Shuffle/Repeat — disc ON = tint primary 15% di atas panel
  // (komposit rgba di atas background.primary; rumus yang sama dengan
  // hexToRGBA(primary, 0.15) di komponen). Tiga kunci, semua diukur
  // dari token tema ASLI:
  // (a) ikon ON (primary[500]) di atas disc lolos 3:1 (bar ikon);
  // (b) ikon OFF (iconColorDefault) di atas panel lolos 3:1;
  // (c) disc terlihat beda dari panel (komposit vs panel ≥ 1.15 —
  // terukur 1.20–1.29; disc memang tint LEMBUT, bukan solid — yang
  // membuat ON tidak tertukar adalah disc + warna ikon + stroke 2.5
  // bersama-sama, bukan disc sendirian).
  it.each(BRAND_THEMES)(
    "$name: ikon ON primary[500] di atas disc tint 15% lolos 3:1",
    (theme) => {
      const panel = theme.colors.background.primary;
      const disc = tintOver(theme.colors.primary[500], panel, 0.15);
      expect(
        contrastRatio(theme.colors.primary[500], disc),
      ).toBeGreaterThanOrEqual(3);
    },
  );

  it.each(BRAND_THEMES)(
    "$name: ikon OFF di atas panel lolos 3:1",
    (theme) => {
      const panel = theme.colors.background.primary;
      // iconColorDefault: gelap = textTertiary, terang = textSecondary.
      const icon = theme.isDark
        ? theme.colors.text.tertiary
        : theme.colors.text.secondary;
      expect(contrastRatio(icon, panel)).toBeGreaterThanOrEqual(3);
    },
  );

  it.each(BRAND_THEMES)(
    "$name: disc ON terlihat beda dari panel (komposit vs panel ≥ 1.15)",
    (theme) => {
      const panel = theme.colors.background.primary;
      const disc = tintOver(theme.colors.primary[500], panel, 0.15);
      expect(contrastRatio(disc, panel)).toBeGreaterThanOrEqual(1.15);
    },
  );
});

// FloatingPlayer (miniplayer) — ON/OFF Shuffle/Repeat di pill memakai
// mekanisme yang SAMA dengan layar Player (d0ddf23d): ON = ikon
// primary[500] + disc tint 15% + stroke 2.5; OFF = ikon text.tertiary
// polos + stroke 2. Latarnya background.elevated (bukan primary).
// Kunci yang sama, diukur dari token tema ASLI:
// (a) ikon ON di atas disc lolos 3:1 (bar ikon);
// (b) ikon OFF di atas elevated lolos 3:1;
// (c) disc terlihat beda dari elevated (komposit vs elevated ≥ 1.15);
// (d) teks badge "1" (pickReadable putih/hitam) di atas primary[500]
// lolos 4.5:1 (bar teks — sama dengan badge Player).
describe("FloatingPlayer — kontras ON/OFF Shuffle/Repeat di pill", () => {
  it.each(BRAND_THEMES)(
    "$name: ikon ON primary[500] di atas disc tint 15% lolos 3:1",
    (theme) => {
      const pill = theme.colors.background.elevated;
      const disc = tintOver(theme.colors.primary[500], pill, 0.15);
      expect(
        contrastRatio(theme.colors.primary[500], disc),
      ).toBeGreaterThanOrEqual(3);
    },
  );

  it.each(BRAND_THEMES)(
    "$name: ikon OFF text.tertiary di atas elevated lolos 3:1",
    (theme) => {
      const pill = theme.colors.background.elevated;
      expect(
        contrastRatio(theme.colors.text.tertiary, pill),
      ).toBeGreaterThanOrEqual(3);
    },
  );

  it.each(BRAND_THEMES)(
    "$name: disc ON terlihat beda dari elevated (komposit vs elevated ≥ 1.15)",
    (theme) => {
      const pill = theme.colors.background.elevated;
      const disc = tintOver(theme.colors.primary[500], pill, 0.15);
      expect(contrastRatio(disc, pill)).toBeGreaterThanOrEqual(1.15);
    },
  );

  it.each(BRAND_THEMES)(
    "$name: teks badge '1' di atas primary[500] lolos 4.5:1",
    (theme) => {
      const primary = theme.colors.primary[500];
      const badgeText =
        pickReadable(["#FFFFFF", "#000000"], primary, AA_NORMAL) ??
        "#FFFFFF";
      expect(contrastRatio(badgeText, primary)).toBeGreaterThanOrEqual(4.5);
    },
  );
});
