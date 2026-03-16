// HAPUS deklarasi ThemeId di sini (jangan double)
import { Theme, ThemeId } from './types';  // ← IMPOR DARI types.ts
import { DEEP_NAVY, MIDNIGHT_BLUE, CHARCOAL_BLACK } from './dark';
import { LIGHT_GRAY, PURE_WHITE } from './light';
import { GOLDEN_HOUR, ROSE_GOLD } from './premium';
import { FOREST_GREEN, OCEAN_WAVE } from './nature';
import { NEON_CYBER, SUNSET_ORANGE } from './cyber';

// ✅ HAPUS BLOK INI (JANGAN DOUBLE DECLARATION)
// export type ThemeId = ...  ← HAPUS!

// Koleksi semua tema
export const ALL_THEMES: Record<ThemeId, Theme> = {
  'deep-navy': DEEP_NAVY,
  'midnight-blue': MIDNIGHT_BLUE,
  'charcoal-black': CHARCOAL_BLACK,
  'light-gray': LIGHT_GRAY,       // ← SEKARANG VALID
  'pure-white': PURE_WHITE,
  'golden-hour': GOLDEN_HOUR,
  'rose-gold': ROSE_GOLD,
  'forest-green': FOREST_GREEN,
  'ocean-wave': OCEAN_WAVE,
  'neon-cyber': NEON_CYBER,
  'sunset-orange': SUNSET_ORANGE,
};

export const THEMES_LIST = Object.values(ALL_THEMES);

// Group by category untuk UI
export const THEME_CATEGORIES = {
  dark: [DEEP_NAVY, MIDNIGHT_BLUE, CHARCOAL_BLACK],
  light: [LIGHT_GRAY, PURE_WHITE],
  premium: [GOLDEN_HOUR, ROSE_GOLD],
  nature: [FOREST_GREEN, OCEAN_WAVE],
  cyber: [NEON_CYBER, SUNSET_ORANGE],
};

// Default theme
export const DEFAULT_THEME = DEEP_NAVY;

// Helper untuk mendapatkan theme by id
export const getThemeById = (id: ThemeId): Theme => {
  return ALL_THEMES[id] || DEFAULT_THEME;
};

// Helper untuk random theme (fun)
export const getRandomTheme = (): Theme => {
  const themes = THEMES_LIST;
  const randomIndex = Math.floor(Math.random() * themes.length);
  return themes[randomIndex];
};