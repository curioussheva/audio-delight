// src/shared/constants/theme.ts
import type {
  Theme,
  ThemeId,
  ThemeSpacing,
  ThemeShadows,
} from "./themes/types";
import { LIGHT_GRAY, PURE_WHITE } from "./themes/light";
import { MIDNIGHT_BLUE, CHARCOAL_BLACK } from "./themes/dark";
import { FOREST_GREEN, OCEAN_WAVE } from "./themes/nature";
import { GOLDEN_HOUR, ROSE_GOLD } from "./themes/premium";
import { NEON_CYBER, SUNSET_ORANGE } from "./themes/cyber";

// Definisikan SPACING dan BASE_SHADOWS
const SPACING: ThemeSpacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
};

const BASE_SHADOWS: ThemeShadows = {
  sm: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  xl: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 12,
  },
};

export const ALL_THEMES: Record<ThemeId, Theme> = {
  "deep-navy": {
    id: "deep-navy",
    name: "Deep Navy",
    isDark: true,
    colors: {
      primary: { 500: "#00D4AA" },
      secondary: { 500: "#3B82F6" },
      background: {
        primary: "#0A1628",
        secondary: "#141E33",
        tertiary: "#1F2A3A",
        elevated: "#2A3440",
      },
      text: {
        primary: "#F0F4F8",
        secondary: "#C8D4E0",
        tertiary: "#9AA8B9",
        disabled: "#4A5568",
        inverse: "#000000",
      },
      accent: {
        blue: "#3B82F6",
        purple: "#8B5CF6",
        orange: "#F59E0B",
        red: "#EF4444",
        green: "#10B981",
      },
      status: {
        success: "#10B981",
        warning: "#F59E0B",
        error: "#EF4444",
        info: "#3B82F6",
      },
      border: { medium: "#334155", light: "#1F2A3A" },
    },
    spacing: SPACING,
    shadows: {
      ...BASE_SHADOWS,
      xl: { ...BASE_SHADOWS.xl!, shadowColor: "#00D4AA", shadowOpacity: 0.3 },
    },
  },

  obsidian: {
    id: "obsidian",
    name: "Obsidian",
    isDark: true,
    colors: {
      primary: { 500: "#22D3EE" },
      secondary: { 500: "#C084FC" },
      background: {
        primary: "#0F0F0F",
        secondary: "#1A1A1A",
        tertiary: "#252525",
        elevated: "#2F2F2F",
      },
      text: {
        primary: "#FAFAFA",
        secondary: "#E5E5E5",
        tertiary: "#A3A3A3",
        disabled: "#525252",
        inverse: "#000000",
      },
      accent: {
        blue: "#22D3EE",
        purple: "#C084FC",
        orange: "#FB923C",
        red: "#F87171",
        green: "#4ADE80",
      },
      status: {
        success: "#4ADE80",
        warning: "#FB923C",
        error: "#F87171",
        info: "#22D3EE",
      },
      border: { medium: "#404040", light: "#252525" },
    },
    spacing: SPACING,
    shadows: BASE_SHADOWS,
  },

  "light-elegant": {
    id: "light-elegant",
    name: "Elegant Light",
    isDark: false,
    colors: {
      primary: { 500: "#00B386" },
      secondary: { 500: "#2563EB" },
      background: {
        primary: "#FFFFFF",
        secondary: "#F8FAFC",
        tertiary: "#F1F5F9",
        elevated: "#FFFFFF",
      },
      text: {
        primary: "#0F172A",
        secondary: "#334155",
        tertiary: "#64748B",
        disabled: "#94A3B8",
        inverse: "#FFFFFF",
      },
      accent: {
        blue: "#2563EB",
        purple: "#7C3AED",
        orange: "#D97706",
        red: "#DC2626",
        green: "#00B386",
      },
      status: {
        success: "#10B981",
        warning: "#F59E0B",
        error: "#EF4444",
        info: "#2563EB",
      },
      border: { medium: "#E2E8F0", light: "#F1F5F9" },
    },
    spacing: SPACING,
    shadows: BASE_SHADOWS,
  },

  "light-silver": {
    id: "light-silver",
    name: "Silver Light",
    isDark: false,
    colors: {
      primary: { 500: "#14B8A6" },
      secondary: { 500: "#0EA5E9" },
      background: {
        primary: "#FAFAFA",
        secondary: "#F4F4F5",
        tertiary: "#E4E4E7",
        elevated: "#FFFFFF",
      },
      text: {
        primary: "#18181B",
        secondary: "#3F3F46",
        tertiary: "#71717A",
        disabled: "#A1A1AA",
        inverse: "#FFFFFF",
      },
      accent: {
        blue: "#0EA5E9",
        purple: "#8B5CF6",
        orange: "#F97316",
        red: "#F43F5E",
        green: "#14B8A6",
      },
      status: {
        success: "#10B981",
        warning: "#F59E0B",
        error: "#EF4444",
        info: "#0EA5E9",
      },
      border: { medium: "#D4D4D8", light: "#E4E4E7" },
    },
    spacing: SPACING,
    shadows: BASE_SHADOWS,
  },

  "light-gray": LIGHT_GRAY,
  "pure-white": PURE_WHITE,
  "midnight-blue": MIDNIGHT_BLUE,
  "charcoal-black": CHARCOAL_BLACK,
  "forest-green": FOREST_GREEN,
  "ocean-wave": OCEAN_WAVE,
  "golden-hour": GOLDEN_HOUR,
  "rose-gold": ROSE_GOLD,
  "neon-cyber": NEON_CYBER,
  "sunset-orange": SUNSET_ORANGE,
};

export const getThemeById = (id: ThemeId): Theme =>
  ALL_THEMES[id] || ALL_THEMES["deep-navy"];

export const getRandomTheme = (): Theme => {
  const keys = Object.keys(ALL_THEMES) as ThemeId[];
  return ALL_THEMES[keys[Math.floor(Math.random() * keys.length)]];
};

export const THEMES_LIST = Object.values(ALL_THEMES);
export const DEFAULT_THEME = ALL_THEMES["deep-navy"];

export const THEME_CATEGORIES = {
  light: ["light-gray", "pure-white", "light-elegant", "light-silver"],
  dark: [
    "deep-navy",
    "obsidian",
    "midnight-blue",
    "charcoal-black",
    "neon-cyber",
    "sunset-orange",
  ],
  nature: ["forest-green", "ocean-wave"],
  premium: ["golden-hour", "rose-gold"],
};
