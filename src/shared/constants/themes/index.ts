import { Theme, ThemeId } from "./types";
import { DEEP_NAVY, MIDNIGHT_BLUE, CHARCOAL_BLACK } from "./dark";
import { LIGHT_GRAY, PURE_WHITE } from "./light";
import { GOLDEN_HOUR, ROSE_GOLD } from "./premium";
import { FOREST_GREEN, OCEAN_WAVE } from "./nature";
import { NEON_CYBER, SUNSET_ORANGE } from "./cyber";

export const ALL_THEMES: Record<ThemeId, Theme> = {
  "deep-navy": DEEP_NAVY,
  "midnight-blue": MIDNIGHT_BLUE,
  "charcoal-black": CHARCOAL_BLACK,
  "light-gray": LIGHT_GRAY,
  "pure-white": PURE_WHITE,
  "golden-hour": GOLDEN_HOUR,
  "rose-gold": ROSE_GOLD,
  "forest-green": FOREST_GREEN,
  "ocean-wave": OCEAN_WAVE,
  "neon-cyber": NEON_CYBER,
  "sunset-orange": SUNSET_ORANGE,
};

export const THEMES_LIST = Object.values(ALL_THEMES);

export const THEME_CATEGORIES = {
  dark: [DEEP_NAVY, MIDNIGHT_BLUE, CHARCOAL_BLACK],
  light: [LIGHT_GRAY, PURE_WHITE],
  premium: [GOLDEN_HOUR, ROSE_GOLD],
  nature: [FOREST_GREEN, OCEAN_WAVE],
  cyber: [NEON_CYBER, SUNSET_ORANGE],
};

export const DEFAULT_THEME = DEEP_NAVY;

export const getThemeById = (id: ThemeId): Theme =>
  ALL_THEMES[id] ?? DEFAULT_THEME;

export const getRandomTheme = (): Theme =>
  THEMES_LIST[Math.floor(Math.random() * THEMES_LIST.length)];