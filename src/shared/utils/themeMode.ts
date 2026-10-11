// src/shared/utils/themeMode.ts
//
// Dua keputusan murni soal tema, dipisah supaya bisa diuji tanpa merender
// React (`jest.config.cjs` hanya menjalankan logika murni).
//
// KENAPA DIPISAH
// `toggleTheme` di ThemeContext dulu hardcode dua tema:
//
//   const newId = theme.isDark ? "light-elegant" : "emerald-noir";
//
// Dari 20 tema, hanya dua itu yang dikenali. Memakai toggle saat berada di
// "rose-gold" melempar user ke "emerald-noir" - tema yang sama sekali lain,
// bukan versi terang dari yang sedang dipakai. Memilih pasangan terdekat
// membutuhkan perhitungan jarak warna, dan itulah yang diuji di sini.

import { ALL_THEMES } from "@/shared/constants/theme";
import type { Theme, ThemeId } from "@/shared/constants/themes/types";
import { contrastRatio } from "@/shared/utils/contrast";

/**
 * Kandidat tema dengan mode berlawanan yang paling dekat warnanya.
 *
 * "Terdekat" diukur dari jarak kontras `background.primary`: memilih kandidat
 * dengan rasio paling rendah berarti latarnya paling mirip, jadi perpindahan
 * terasa seperti membalik mode - bukan pindah ke tema lain.
 *
 * Mengembalikan `null` kalau tidak ada kandidat (mis. semua tema bergelap).
 */
export const findCounterpartTheme = (themeId: ThemeId): ThemeId | null => {
  const current: Theme | undefined = ALL_THEMES[themeId];

  if (!current) {
    return null;
  }

  const candidates = Object.values(ALL_THEMES).filter(
    (t) => t.isDark !== current.isDark,
  );

  if (candidates.length === 0) {
    return null;
  }

  let best: Theme | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const distance = contrastRatio(
      candidate.colors.background.primary,
      current.colors.background.primary,
    );

    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }

  return best ? (best.id as ThemeId) : null;
};

/**
 * Id tema berikutnya saat toggle ditekan.
 *
 * Selalu mengembalikan id yang valid: kalau tidak ada pasangan (atau id tidak
 * dikenal), ia jatuh ke perilaku lama supaya toggle tidak pernah "mati".
 */
export const resolveToggleTarget = (themeId: ThemeId): ThemeId =>
  findCounterpartTheme(themeId) ?? (ALL_THEMES[themeId]?.isDark ? "light-elegant" : "emerald-noir");
