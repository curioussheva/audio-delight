// FASE 3 EQ — kunci kontras layar Audio (tab Equalizer + mode
// DSP/Solfeggio/Bit-Perfect) di keempat tema. Pola sama dengan
// playerContrast/libraryContrast: pasangan teks-latar diukur dari token
// tema sungguhan, bukan angka contoh.
//
// Ukuran minimum yang dipakai:
// - Teks biasa/aksen: AA_NORMAL (4,5:1).
// - Teks kecil redup (caption, bypass, hint preset, teks band 0 dB, note
//   verdict) di atas kartu: dikunci 3,0:1 — rentang terukur 4,39–7,38
//   (Hearth 4,39, nyaris AA). Kandidat Fase 5, seperti dua pasangan
//   tint-di-atas-tint di Library.
// - Warna aksen (DSP, chip aktif, tone Bit-Perfect, teks band): dipakai
//   lewat accentOn/pickReadable dengan fallback teks — test mengulangi
//   panggilan yang sama persis seperti komponen, supaya fallback yang
//   lolos ikut terkunci, bukan warna mentahnya.
//
// Cacat lama yang diperbaiki ronde ini (terukur 2026-11-18, sebelum
// perbaikan): pill peringatan clip 45% hitam — teks kuning 1,99–2,03
// dan merah 1,02–1,04 di tema terang (kini 90% hitam: kuning
// 9,27–10,76, merah 4,72–5,48); hint mode nonaktif + SectionToggle
// mati tertiary-di-atas-tertiary 3,94–4,34 (kini secondary); tone
// Bit-Perfect hijau/oranye mentah 4,15–4,51 di tema terang (kini
// accentOn dengan fallback teks).
import {
  contrastRatio,
  accentOn,
  pickReadable,
  parseHex,
  AA_NORMAL,
  AA_LARGE,
} from "@/shared/utils/contrast";
import {
  GRAPH_CLIP_YELLOW,
  GRAPH_CLIP_RED,
} from "@/features/equalizer/api/graphClip";
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

/** Komposit warna fg dengan alpha di atas bg (rgba(0,0,0,0.9) dll). */
const tintOver = (fg: string, bg: string, alpha: number): string => {
  const f = parseHex(fg);
  const b = parseHex(bg);
  if (!f || !b) throw new Error(`hex tidak terbaca: ${fg} / ${bg}`);
  const mix = (x: number, y: number) =>
    Math.round(x * alpha + y * (1 - alpha));
  return `#${[mix(f.r, b.r), mix(f.g, b.g), mix(f.b, b.b)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`;
};

/** Warna DSP seperti di equalizer.tsx (bass/oranye, widener/biru,
 * master/hijau) — accentOn di atas permukaan kartu, fallback teks. */
const dspColors = (t: Theme) => {
  const c = t.colors;
  const sec = c.background.secondary;
  const fallback = [c.text.primary, c.text.secondary];
  return {
    bass: accentOn([c.accent.orange], sec, fallback),
    width: accentOn([c.accent.blue], sec, fallback),
    master: accentOn([c.accent.green], sec, fallback),
  };
};

/** Warna aktif mode (master = DSP/DSP+Solfeggio/Bit-Perfect) seperti
 * di equalizer.tsx. */
const modeActiveColors = (t: Theme) => {
  const c = t.colors;
  const master = accentOn(
    [c.accent.green, c.accent.orange, c.accent.blue],
    c.background.secondary,
    [c.text.primary, c.text.secondary],
  );
  return { master };
};

describe("FASE 3 EQ — kontras layar Audio", () => {
  it.each(THEMES)(
    "teks utama (primary/secondary/tertiary) di atas background.primary lolos AA",
    (t) => {
      const c = t.colors;
      for (const text of [c.text.primary, c.text.secondary, c.text.tertiary]) {
        expect(contrastRatio(text, c.background.primary)).toBeGreaterThanOrEqual(
          AA_NORMAL,
        );
      }
    },
  );

  it.each(THEMES)(
    "teks primary/secondary di atas kartu (background.secondary) lolos AA",
    (t) => {
      const c = t.colors;
      for (const text of [c.text.primary, c.text.secondary]) {
        expect(contrastRatio(text, c.background.secondary)).toBeGreaterThanOrEqual(
          AA_NORMAL,
        );
      }
    },
  );

  it.each(THEMES)(
    "teks redup (tertiary) di atas kartu lolos 3:1 — Hearth 4,39, kandidat Fase 5",
    (t) => {
      const c = t.colors;
      expect(
        contrastRatio(c.text.tertiary, c.background.secondary),
      ).toBeGreaterThanOrEqual(AA_LARGE);
    },
  );

  it.each(THEMES)(
    "teks primary/secondary di atas tombol tertiary (mode nonaktif, SectionToggle mati) lolos AA",
    (t) => {
      const c = t.colors;
      for (const text of [c.text.primary, c.text.secondary]) {
        expect(contrastRatio(text, c.background.tertiary)).toBeGreaterThanOrEqual(
          AA_NORMAL,
        );
      }
    },
  );

  it.each(THEMES)(
    "teks primary/secondary di atas permukaan elevated (chip preset, kartu profil headphone) lolos AA",
    (t) => {
      const c = t.colors;
      for (const text of [c.text.primary, c.text.secondary]) {
        expect(contrastRatio(text, c.background.elevated)).toBeGreaterThanOrEqual(
          AA_NORMAL,
        );
      }
    },
  );

  it.each(THEMES)(
    "label + hint mode aktif (pickReadable di atas warna master) lolos AA",
    (t) => {
      const c = t.colors;
      const { master } = modeActiveColors(t);
      expect(
        contrastRatio(
          pickReadable([c.text.inverse, c.text.primary], master, AA_NORMAL) ??
            c.text.primary,
          master,
        ),
      ).toBeGreaterThanOrEqual(AA_NORMAL);
      expect(
        contrastRatio(
          pickReadable(
            [c.text.inverse, c.text.secondary],
            master,
            AA_NORMAL,
          ) ?? c.text.secondary,
          master,
        ),
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    },
  );

  it.each(THEMES)(
    "warna DSP (bass/oranye, widener/biru, master/hijau) di atas kartu lolos AA",
    (t) => {
      const c = t.colors;
      const { bass, width, master } = dspColors(t);
      for (const color of [bass, width, master]) {
        expect(
          contrastRatio(color, c.background.secondary),
        ).toBeGreaterThanOrEqual(AA_NORMAL);
      }
    },
  );

  it.each(THEMES)(
    "nilai Solfeggio (accentOn primary[500]) di atas kartu lolos AA",
    (t) => {
      const c = t.colors;
      const value = accentOn([c.primary[500]], c.background.secondary, [
        c.text.primary,
        c.text.secondary,
      ]);
      expect(
        contrastRatio(value, c.background.secondary),
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    },
  );

  it.each(THEMES)(
    "chip preset aktif (pickReadable di atas primary[500]) lolos AA",
    (t) => {
      const c = t.colors;
      const label =
        pickReadable(
          [c.text.inverse, c.background.primary, c.text.primary],
          c.primary[500],
          AA_NORMAL,
        ) ?? c.background.primary;
      expect(contrastRatio(label, c.primary[500])).toBeGreaterThanOrEqual(
        AA_NORMAL,
      );
    },
  );

  it.each(THEMES)(
    "teks peringatan clip (kuning/merah) di atas pill 90% hitam lolos AA",
    (t) => {
      const c = t.colors;
      const pillBg = tintOver("#000000", c.background.secondary, 0.9);
      expect(contrastRatio(GRAPH_CLIP_YELLOW, pillBg)).toBeGreaterThanOrEqual(
        AA_NORMAL,
      );
      expect(contrastRatio(GRAPH_CLIP_RED, pillBg)).toBeGreaterThanOrEqual(
        AA_NORMAL,
      );
    },
  );

  it.each(THEMES)(
    "tone Bit-Perfect (hijau aktif / oranye fallback, accentOn) di atas kartu lolos AA",
    (t) => {
      const c = t.colors;
      const sec = c.background.secondary;
      const fallback = [c.text.primary, c.text.secondary];
      expect(
        contrastRatio(
          accentOn([c.accent.green], sec, fallback),
          sec,
        ),
      ).toBeGreaterThanOrEqual(AA_NORMAL);
      expect(
        contrastRatio(
          accentOn([c.accent.orange], sec, fallback),
          sec,
        ),
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    },
  );

  it.each(THEMES)(
    "teks band EQ (accentOn biru; 0 dB redup) di atas kartu lolos — redup 3:1",
    (t) => {
      const c = t.colors;
      const sec = c.background.secondary;
      const gain = accentOn([c.accent.blue], sec, [
        c.text.primary,
        c.text.secondary,
      ]);
      expect(contrastRatio(gain, sec)).toBeGreaterThanOrEqual(AA_NORMAL);
      expect(contrastRatio(c.text.tertiary, sec)).toBeGreaterThanOrEqual(
        AA_LARGE,
      );
    },
  );

  it.each(THEMES)(
    "HeadphoneSection: teks 'Aktif' (primary[500]) di atas background.primary lolos AA",
    (t) => {
      const c = t.colors;
      expect(
        contrastRatio(c.primary[500], c.background.primary),
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    },
  );

  it.each(THEMES)(
    "baris fallback Bit-Perfect (accent.orange) di atas background.primary lolos AA",
    (t) => {
      const c = t.colors;
      expect(
        contrastRatio(c.accent.orange, c.background.primary),
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    },
  );
});
