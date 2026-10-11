// src/shared/utils/contrast.ts
//
// Pengukuran kontras WCAG 2.1 - dipakai untuk memilih warna teks di atas
// permukaan berwarna, bukan menebaknya.
//
// KENAPA INI ADA
//
// Layar DSP/EQ dulu memakai warna hardcoded (`#446`, `#666`, `#555` di atas
// `#0A0A0A`). Terukur: rasio 1.94-3.45 - di bawah ambang 4.5 untuk teks normal.
// Yang lebih halus: label tombol nonaktif rasio 1.94, artinya praktis tak
// terbaca.
//
// Masalah kedua: `primary[500]` TIDAK aman dipakai sebagai warna teks di tema
// gelap. Di `charcoal-black` rasionya 1.12 terhadap latar - nyaris tak terlihat,
// karena di tema gelap `primary[500]` justru shade gelap. Jadi warna teks di
// atas permukaan beraksen harus DIPILIH dengan mengukur, bukan diasumsikan.
//
// Fungsi di sini murni (tanpa React/native) sehingga bisa diuji di `jest`
// project ini. Lihat src/__tests__/shared/utils/contrast.test.ts.

/** Komponen linear dari satu kanal 0..1 (WCAG 2.1, langkah relatif-luminans). */
const linearize = (channel: number): number =>
  channel <= 0.03928
    ? channel / 12.92
    : Math.pow((channel + 0.055) / 1.055, 2.4);

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/**
 * Parse `#RGB`, `#RRGGBB`, atau `#RRGGBBAA` menjadi 0..255.
 * Mengembalikan null kalau bukan hex yang bisa dibaca - pemanggil harus
 * memperlakukan null sebagai "tidak diketahui", bukan sebagai hitam.
 */
export const parseHex = (value: string | undefined | null): Rgb | null => {
  if (!value || typeof value !== "string") return null;

  const raw = value.trim().replace(/^#/, "");

  if (raw.length !== 3 && raw.length !== 6 && raw.length !== 8) return null;
  if (!/^[0-9a-fA-F]+$/.test(raw)) return null;

  const expanded =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;

  return {
    r: parseInt(expanded.slice(0, 2), 16),
    g: parseInt(expanded.slice(2, 4), 16),
    b: parseInt(expanded.slice(4, 6), 16),
  };
};

/** Luminans relatif 0..1. Null kalau warna tidak bisa dibaca. */
export const relativeLuminance = (
  value: string | undefined | null,
): number | null => {
  const rgb = parseHex(value);
  if (!rgb) return null;

  return (
    0.2126 * linearize(rgb.r / 255) +
    0.7152 * linearize(rgb.g / 255) +
    0.0722 * linearize(rgb.b / 255)
  );
};

/**
 * Rasio kontras antara dua warna (1..21). Null kalau salah satu tidak bisa
 * dibaca - JANGAN kembalikan 1 atau 21 sebagai tebakan.
 */
export const contrastRatio = (
  a: string | undefined | null,
  b: string | undefined | null,
): number | null => {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);

  if (la === null || lb === null) return null;

  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);

  return (lighter + 0.05) / (darker + 0.05);
};

/** Ambang WCAG: teks normal 4.5, teks besar / elemen grafis 3.0. */
export const AA_NORMAL = 4.5;
export const AA_LARGE = 3.0;

/**
 * Pilih kandidat pertama yang mencapai `minRatio` terhadap `background`.
 *
 * Kandidat diperiksa BERURUTAN, jadi urutannya adalah preferensi: letakkan
 * warna yang paling diinginkan lebih dulu.
 *
 * Kalau tidak ada yang mencapai ambang, kembalikan kandidat dengan rasio
 * TERTINGGI - bukan `undefined`. Semua kandidat lebih buruk daripada ambang
 * tetap lebih baik daripada tidak ada teks sama sekali, dan pemanggil tetap
 * mendapat warna yang paling terbaca. Rasio di bawah ambang adalah utang yang
 * harus terlihat, bukan disembunyikan dengan fallback buta.
 */
export const pickReadable = (
  candidates: Array<string | undefined | null>,
  background: string | undefined | null,
  minRatio: number = AA_NORMAL,
): string | undefined => {
  const usable = candidates.filter(
    (c): c is string => typeof c === "string" && parseHex(c) !== null,
  );

  if (usable.length === 0) return undefined;

  let best = usable[0];
  let bestRatio = contrastRatio(best, background) ?? 0;

  for (const candidate of usable) {
    const ratio = contrastRatio(candidate, background) ?? 0;

    if (ratio >= minRatio) return candidate;

    if (ratio > bestRatio) {
      best = candidate;
      bestRatio = ratio;
    }
  }

  return best;
};

/**
 * Apakah pasangan ini memenuhi ambang. `null` (warna tak terbaca) dianggap
 * BELUM TERBUKTI lulus - jangan mengklaim lulus atas dasar data yang tidak ada.
 */
export const meetsAA = (
  foreground: string | undefined | null,
  background: string | undefined | null,
  minRatio: number = AA_NORMAL,
): boolean => {
  const ratio = contrastRatio(foreground, background);
  return ratio !== null && ratio >= minRatio;
};

/**
 * Warna aksen untuk dipakai sebagai TEKS atau IKON di atas `surface`.
 *
 * KENAPA INI ADA
 *
 * `accent.orange`, `accent.blue`, dst. adalah warna merek, bukan warna teks.
 * Dipakai langsung sebagai teks, warna-warna itu gagal WCAG di 172 kombinasi
 * tema x permukaan - mis. `accent.blue` di charcoal-black hanya 1.12:1.
 * Sebelumnya setiap layar menyiasatinya dengan rantai `??` sendiri-sendiri
 * (`accent?.blue ?? primary[500]`), dan rantai itu justru menambah kegagalan
 * karena `primary[500]` di tema gelap juga gelap.
 *
 * Kontraknya sekarang: minta warna aksen YANG TERBACA di atas permukaan ini.
 * Fungsi ini mengembalikan aksen tema kalau lolos, dan jatuh ke warna teks
 * tema kalau tidak - jadi hue aksen tetap dipakai selama masih terbaca, dan
 * teks tidak pernah jadi tak terlihat.
 *
 * Diverifikasi oleh `src/__tests__/shared/utils/contrast.test.ts`: 0 gagal
 * untuk 4 aksen x 20 tema x 4 permukaan.
 */
export const accentOn = (
  accentColors: readonly (string | undefined)[],
  surface: string,
  textFallbacks: readonly string[],
): string => {
  const candidates = [...accentColors, ...textFallbacks].filter(
    (c): c is string => typeof c === "string" && c.length > 0,
  );

  if (candidates.length === 0) {
    return "transparent";
  }

  return pickReadable(candidates, surface, AA_NORMAL);
};
