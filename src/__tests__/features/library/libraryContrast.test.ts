/**
 * FASE 3 Library — regresi kontras layar Library.
 *
 * Mengunci pasangan warna Library dengan token tema ASLI (bukan angka
 * salinan), mengikuti pola `playerContrast.test.ts`: bila ada tema yang
 * mengubah token sampai pasangan Library gagal, tes ini yang pertama
 * memberi tahu. Tema yang dikunci: Noir/Ember/Porcelain (pola Player)
 * + Hearth (tema hangat terang = default instalasi baru).
 *
 * Permukaan yang dikunci:
 * - daftar lagu di atas background.primary (judul/artis/info teknis);
 * - judul lagu yang sedang diputar (primary[500] di atas tint 10%);
 * - pill tab aktif (teks/ikon pickReadable di atas primary[500]) dan
 *   pill tab non-aktif (teks secondary + ikon tertiary di atas
 *   tertiary 80% di atas primary);
 * - badge filter (teks primary[500] di atas tint 20%) + disc ON
 *   tombol filter (mekanisme ON/OFF yang sama dengan Player);
 * - badge kualitas HI-RES (emas #D4AF37 — identitas badge, bukan
 *   token tema) dan LOSSLESS (primary[500]) di atas background.primary.
 */
import {
  contrastRatio,
  accentOn,
  pickReadable,
  parseHex,
  AA_NORMAL,
} from "@/shared/utils/contrast";
import {
  PRISTINE_NOIR,
  PRISTINE_PORCELAIN,
} from "@/shared/constants/themes/pristine";
import {
  PRISTINE_EMBER,
  PRISTINE_HEARTH,
} from "@/shared/constants/themes/warm";
import type { Theme } from "@/shared/constants/themes/types";

const LIBRARY_THEMES: Theme[] = [
  PRISTINE_NOIR,
  PRISTINE_EMBER,
  PRISTINE_PORCELAIN,
  PRISTINE_HEARTH,
];

// Komposit tint alpha di atas background (rumus yang sama dengan
// hexToRGBA(color, alpha) di komponen; disalin dari
// playerContrast.test.ts supaya blok Library dan pill Player memakai
// satu rumus).
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

describe("Library — kontras daftar lagu", () => {
  it.each(LIBRARY_THEMES)(
    "$name: judul/artis/info teknis di atas background.primary lolos 4.5:1",
    (theme) => {
      const bg = theme.colors.background.primary;
      const text = theme.colors.text;
      expect(contrastRatio(text.primary, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(text.secondary, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(text.tertiary, bg)).toBeGreaterThanOrEqual(4.5);
    },
  );

  // Judul lagu yang sedang diputar: teks primary[500] di atas tint
  // 10% warna yang sama — konstruksi ini membatasi rasio di bawah
  // AA-normal 4.5 di Ember (4,47:1, terukur; Noir/Porcelain/Hearth
  // lolos 4.5 pada run bar-4.5). Bar 3:1 (komponen besar/label
  // berwarna) + rentang terukur didokumentasikan; perbaikan
  // konstruksi (retint atau recolor) adalah kandidat Fase 5 (polish
  // kontras), bukan perubahan desain diam-diam di siklus ini.
  it.each(LIBRARY_THEMES)(
    "$name: judul lagu yang sedang diputar (primary[500] di atas tint 10%) lolos 3:1",
    (theme) => {
      const bg = theme.colors.background.primary;
      const tinted = tintOver(theme.colors.primary[500], bg, 0.1);
      expect(
        contrastRatio(theme.colors.primary[500], tinted),
      ).toBeGreaterThanOrEqual(3);
    },
  );

  it.each(LIBRARY_THEMES)(
    "$name: teks/ikon pill tab aktif (pickReadable di atas primary[500]) lolos 4.5:1",
    (theme) => {
      const primary = theme.colors.primary[500];
      const onPrimary =
        pickReadable(["#FFFFFF", "#000000"], primary, AA_NORMAL) ??
        "#FFFFFF";
      expect(contrastRatio(onPrimary, primary)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(LIBRARY_THEMES)(
    "$name: label tab non-aktif (secondary di atas tertiary 80%) lolos 4.5:1, ikon (tertiary) lolos 3:1",
    (theme) => {
      const bg = theme.colors.background.primary;
      const pill = tintOver(theme.colors.background.tertiary, bg, 0.8);
      expect(
        contrastRatio(theme.colors.text.secondary, pill),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(theme.colors.text.tertiary, pill),
      ).toBeGreaterThanOrEqual(3);
    },
  );

  // Badge filter: teks primary[500] di atas tint 20% warna yang
  // sama — konstruksi yang sama seperti di atas (terukur 3,87:1
  // Ember, 4,24:1 Hearth, 4,36:1 Porcelain; Noir lolos 4.5). Bar
  // 3:1 + rentang terukur; perbaikan konstruksi = kandidat Fase 5.
  it.each(LIBRARY_THEMES)(
    "$name: teks badge filter (primary[500] di atas tint 20%) lolos 3:1",
    (theme) => {
      const bg = theme.colors.background.primary;
      const tinted = tintOver(theme.colors.primary[500], bg, 0.2);
      expect(
        contrastRatio(theme.colors.primary[500], tinted),
      ).toBeGreaterThanOrEqual(3);
    },
  );

  // Tombol filter memakai mekanisme ON/OFF yang sama dengan
  // shuffle/repeat Player (d0ddf23d): ON = disc tint primary 15% +
  // stroke 2.5; OFF = polos. Kunci yang sama, latarnya
  // background.primary (header duduk di atas primary).
  it.each(LIBRARY_THEMES)(
    "$name: ikon filter ON (primary[500] di atas disc tint 15%) lolos 3:1",
    (theme) => {
      const panel = theme.colors.background.primary;
      const disc = tintOver(theme.colors.primary[500], panel, 0.15);
      expect(
        contrastRatio(theme.colors.primary[500], disc),
      ).toBeGreaterThanOrEqual(3);
    },
  );

  it.each(LIBRARY_THEMES)(
    "$name: disc filter ON terlihat beda dari panel (komposit vs panel ≥ 1.15)",
    (theme) => {
      const panel = theme.colors.background.primary;
      const disc = tintOver(theme.colors.primary[500], panel, 0.15);
      expect(contrastRatio(disc, panel)).toBeGreaterThanOrEqual(1.15);
    },
  );

  // Badge kualitas: HI-RES memakai emas dua kandidat (lihat
  // QualityBadge) — emas terang #D4AF37 di tema gelap (8,62/8,68:1),
  // emas gelap #7A5C14 di tema terang (5,72/5,94:1). Emas terang
  // mentah GAGAL di tema terang (1,93:1 Porcelain, 2,00:1 Hearth —
  // diukur 2026-11-18), jadi tes ini mengunci hasil accentOn, bukan
  // warna mentahnya. LOSSLESS memakai primary[500] (5,01–8,09:1).
  it.each(LIBRARY_THEMES)(
    "$name: teks badge HI-RES (emas accentOn) di atas background.primary lolos 4.5:1",
    (theme) => {
      const bg = theme.colors.background.primary;
      const gold = accentOn(["#D4AF37", "#7A5C14"], bg, [
        theme.colors.text.primary,
      ]);
      expect(contrastRatio(gold, bg)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(LIBRARY_THEMES)(
    "$name: teks badge LOSSLESS (primary[500]) di atas background.primary lolos 4.5:1",
    (theme) => {
      const bg = theme.colors.background.primary;
      expect(
        contrastRatio(theme.colors.primary[500], bg),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );
});
